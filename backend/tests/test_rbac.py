from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from app.config.config import Config
from app.config.db import get_async_db, get_redis
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.rbac import RbacAudit, Role, user_roles
from app.models.users import User
from app.rbac import migrate
from app.services.object_storage import generated_image_owner
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def rbac(tmp_path, monkeypatch):
    monkeypatch.setattr(Config, "JWT_SECRET_KEY", "rbac-test-secret-" * 4)
    bind = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'rbac.db'}")
    await migrate(bind)
    async with AsyncSession(bind, expire_on_commit=False) as db, db.begin():
        roles = {role.code: role for role in (await db.scalars(select(Role))).all()}
        for user_id, role in [(1, "admin"), (2, "designer"), (3, "viewer")]:
            db.add(
                User(
                    id=user_id,
                    username=f"user-{user_id}",
                    password_hash=hash_password("password123"),
                    is_active=True,
                    roles=[roles[role]],
                )
            )
    sessions, headers = {}, {}
    for user_id in (1, 2, 3):
        token, sid = create_access_token(user_id)
        sessions[Config.get_session_user_key(str(user_id))] = sid
        headers[user_id] = {"Authorization": f"Bearer {token}"}
    redis = AsyncMock()
    redis.get.side_effect = lambda key: sessions.get(key)
    redis.delete.side_effect = lambda key: sessions.pop(key, None)
    redis.set.side_effect = lambda key, value, **kwargs: sessions.__setitem__(
        key, value
    )

    async def database():
        async with AsyncSession(bind, expire_on_commit=False) as db:
            try:
                yield db
                await db.commit()
            except Exception:
                await db.rollback()
                raise

    app.dependency_overrides[get_async_db] = database
    app.dependency_overrides[get_redis] = lambda: redis
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app), base_url="http://test"
        ) as client:
            yield SimpleNamespace(
                client=client, headers=headers, bind=bind, roles=roles, redis=redis
            )
    finally:
        app.dependency_overrides.pop(get_async_db, None)
        app.dependency_overrides.pop(get_redis, None)
        await bind.dispose()


@pytest.mark.anyio
async def test_permission_boundaries_and_profile(rbac):
    c, h = rbac.client, rbac.headers
    assert (await c.get("/api/rbac/users")).status_code == 401
    assert (await c.get("/api/rbac/users", headers=h[2])).status_code == 403
    profile = (await c.get("/api/auth/me", headers=h[3])).json()
    assert profile["roles"][0]["code"] == "viewer"
    assert set(profile["permissions"]) == {"designs.read", "assets.read"}
    assert (await c.get("/api/designs", headers=h[3])).status_code == 200
    draft = {"design": {"templateId": "sample", "orderId": "one"}}
    assert (
        await c.put("/api/designs/sample", headers=h[3], json=draft)
    ).status_code == 403
    assert (
        await c.put("/api/designs/sample", headers=h[2], json=draft)
    ).status_code == 200
    assert (
        await c.post(
            "/api/assets/batch-delete", headers=h[3], json={"object_keys": ["x"]}
        )
    ).status_code == 403
    assert (
        await c.post(
            "/api/psd/uploads", headers=h[3], json={"filename": "a.psd", "size": 2}
        )
    ).status_code == 403


@pytest.mark.anyio
async def test_role_revocation_and_disable_apply_to_existing_token(rbac):
    c, h = rbac.client, rbac.headers
    assert (await c.get("/api/designs", headers=h[2])).status_code == 200
    response = await c.put(
        "/api/rbac/users/2/access",
        headers=h[1],
        json={"role_ids": [], "is_active": True},
    )
    assert response.status_code == 200
    assert response.json()["permissions"] == []
    assert (await c.get("/api/designs", headers=h[2])).status_code == 403
    assert (await c.get("/api/auth/me", headers=h[2])).status_code == 200
    assert (
        await c.put(
            "/api/rbac/users/2/access",
            headers=h[1],
            json={"role_ids": [], "is_active": False},
        )
    ).status_code == 200
    assert (await c.get("/api/auth/me", headers=h[2])).status_code == 401
    await c.put(
        "/api/rbac/users/2/access",
        headers=h[1],
        json={"role_ids": [rbac.roles["designer"].id], "is_active": True},
    )
    assert (await c.get("/api/auth/me", headers=h[2])).status_code == 401


@pytest.mark.anyio
async def test_last_admin_and_system_role_protection(rbac):
    c, h = rbac.client, rbac.headers
    assert (
        await c.put(
            "/api/rbac/users/1/access",
            headers=h[1],
            json={"role_ids": [], "is_active": True},
        )
    ).status_code == 409
    assert (
        await c.put(
            "/api/rbac/users/1/access",
            headers=h[1],
            json={"role_ids": [rbac.roles["admin"].id], "is_active": False},
        )
    ).status_code == 409
    admin_id = rbac.roles["admin"].id
    assert (
        await c.put(
            f"/api/rbac/roles/{admin_id}",
            headers=h[1],
            json={"name": "x", "permission_codes": []},
        )
    ).status_code == 409
    assert (
        await c.delete(f"/api/rbac/roles/{admin_id}", headers=h[1])
    ).status_code == 409
    assert (
        await c.put(
            "/api/rbac/users/2/access",
            headers=h[1],
            json={"role_ids": [admin_id], "is_active": True},
        )
    ).status_code == 200
    assert (
        await c.put(
            "/api/rbac/users/1/access",
            headers=h[1],
            json={"role_ids": [], "is_active": True},
        )
    ).status_code == 200
    assert (await c.get("/api/rbac/roles", headers=h[1])).status_code == 403


@pytest.mark.anyio
async def test_role_lifecycle_unknown_permissions_and_audit(rbac):
    c, h = rbac.client, rbac.headers
    payload = {"code": "custom", "name": "审核员", "permission_codes": ["designs.read"]}
    assert (
        await c.post(
            "/api/rbac/roles",
            headers=h[1],
            json={**payload, "permission_codes": ["unknown"]},
        )
    ).status_code == 422
    created = await c.post("/api/rbac/roles", headers=h[1], json=payload)
    assert created.status_code == 201
    role_id = created.json()["id"]
    assert (
        await c.post("/api/rbac/roles", headers=h[1], json=payload)
    ).status_code == 409
    assert (
        await c.put(
            "/api/rbac/users/2/access",
            headers=h[1],
            json={"role_ids": [role_id, role_id], "is_active": True},
        )
    ).status_code == 200
    assert (
        await c.delete(f"/api/rbac/roles/{role_id}", headers=h[1])
    ).status_code == 409
    assert (
        await c.put(
            f"/api/rbac/roles/{role_id}",
            headers=h[1],
            json={"name": "审核员", "permission_codes": ["assets.read"]},
        )
    ).status_code == 200
    assert (await c.get("/api/auth/me", headers=h[2])).json()["permissions"] == [
        "assets.read"
    ]
    await c.put(
        "/api/rbac/users/2/access",
        headers=h[1],
        json={"role_ids": [], "is_active": True},
    )
    assert (
        await c.delete(f"/api/rbac/roles/{role_id}", headers=h[1])
    ).status_code == 204
    audits = (await c.get("/api/rbac/audits", headers=h[1])).json()
    assert {row["action"] for row in audits} >= {
        "role.create",
        "role.update",
        "role.delete",
        "user.access.update",
    }
    assert all(row["actor_id"] == 1 for row in audits)


@pytest.mark.anyio
async def test_managed_account_creation_and_public_registration_no_escalation(rbac):
    c, h = rbac.client, rbac.headers
    account = {
        "username": "new-user",
        "password": "long-password-123",
        "role_ids": [rbac.roles["viewer"].id],
    }
    response = await c.post("/api/rbac/users", headers=h[1], json=account)
    assert response.status_code == 201
    assert response.json()["permissions"] == ["assets.read", "designs.read"]
    assert "password" not in response.text
    assert (
        await c.post("/api/rbac/users", headers=h[1], json=account)
    ).status_code == 409
    assert (await c.post("/api/auth/register", json=account)).status_code == 422
    public = await c.post(
        "/api/auth/register", json={"username": "public", "password": "password123"}
    )
    assert public.status_code == 201
    assert public.json()["permissions"] == []
    assert (await c.get("/api/rbac/users?limit=1&q=new", headers=h[1])).json()[
        "total"
    ] == 1
    assert (
        await c.put(
            "/api/rbac/users/2/access",
            headers=h[1],
            json={"role_ids": [99999], "is_active": True},
        )
    ).status_code == 422


@pytest.mark.anyio
async def test_migration_does_not_restore_revoked_roles_or_changed_permissions(rbac):
    async with AsyncSession(rbac.bind) as db, db.begin():
        await db.execute(delete(user_roles).where(user_roles.c.user_id == 2))
        designer = await db.get(Role, rbac.roles["designer"].id)
        designer.permissions = []
    await migrate(rbac.bind)
    async with AsyncSession(rbac.bind) as db:
        assert (await db.get(User, 2)).roles == []
        assert (await db.get(Role, rbac.roles["designer"].id)).permissions == []
        assert len((await db.scalars(select(Role))).all()) == 3


@pytest.mark.anyio
async def test_first_migration_keeps_existing_accounts_as_designers_only(tmp_path):
    bind = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'legacy.db'}")
    try:
        async with bind.begin() as connection:
            await connection.run_sync(User.__table__.create)
            await connection.execute(
                User.__table__.insert().values(
                    username="legacy", password_hash="unused", is_active=True
                )
            )
        await migrate(bind)
        async with AsyncSession(bind) as db:
            user = await db.scalar(select(User))
            assert [role.code for role in user.roles] == ["designer"]
            assert "rbac.manage" not in user.permissions
    finally:
        await bind.dispose()


@pytest.mark.anyio
async def test_administrator_bootstrap_is_explicit_and_idempotent(rbac, monkeypatch):
    from app import rbac as commands

    monkeypatch.setattr(commands, "engine", rbac.bind)
    with pytest.raises(ValueError):
        await commands.bootstrap_admin("nonexistent")
    await commands.bootstrap_admin("user-3")
    await commands.bootstrap_admin("user-3")
    async with AsyncSession(rbac.bind) as db:
        user = await db.get(User, 3)
        assert "rbac.manage" in user.permissions
        rows = (
            await db.scalars(
                select(RbacAudit).where(RbacAudit.action == "admin.bootstrap")
            )
        ).all()
        assert len(rows) == 1


@pytest.mark.anyio
async def test_login_returns_current_permissions_and_usable_session(rbac):
    response = await rbac.client.post(
        "/api/auth/login", json={"username": "user-3", "password": "password123"}
    )
    assert response.status_code == 200
    result = response.json()
    assert result["user"]["permissions"] == ["assets.read", "designs.read"]
    assert result["user"]["roles"][0]["code"] == "viewer"
    response = await rbac.client.get(
        "/api/auth/me", headers={"Authorization": "Bearer " + result["access_token"]}
    )
    assert response.status_code == 200


@pytest.mark.anyio
async def test_session_store_failure_rolls_back_account_disable(rbac):
    from redis.exceptions import RedisError

    rbac.redis.delete.side_effect = RedisError("unavailable")
    response = await rbac.client.put(
        "/api/rbac/users/2/access",
        headers=rbac.headers[1],
        json={"role_ids": [], "is_active": False},
    )
    assert response.status_code == 503
    response = await rbac.client.get("/api/auth/me", headers=rbac.headers[2])
    assert response.status_code == 200
    assert "designs.write" in response.json()["permissions"]


@pytest.mark.anyio
async def test_dedicated_admin_initialization_login_and_idempotent_password(rbac):
    from app.core.rbac import PERMISSIONS
    from app.core.security import verify_password

    password = "initial-admin-password-123"
    await migrate(rbac.bind, admin_password=password)
    response = await rbac.client.post(
        "/api/auth/login", json={"username": "admin", "password": password}
    )
    assert response.status_code == 200
    profile = response.json()["user"]
    assert profile["is_system_admin"] is True
    assert set(profile["permissions"]) == set(PERMISSIONS)
    assert [role["code"] for role in profile["roles"]] == ["admin"]
    assert password not in response.text
    await migrate(rbac.bind, admin_password="changed-in-file-not-a-reset")
    async with AsyncSession(rbac.bind) as db:
        user = await db.scalar(select(User).where(User.username == "admin"))
        assert verify_password(password, user.password_hash)
        audits = (
            await db.scalars(
                select(RbacAudit).where(RbacAudit.action == "admin.initialize")
            )
        ).all()
        assert len(audits) == 1
        assert password not in str(audits[0].detail)


@pytest.mark.anyio
async def test_dedicated_admin_is_protected_even_with_other_administrators(rbac):
    await migrate(rbac.bind, admin_password="protected-admin-password")
    async with AsyncSession(rbac.bind) as db:
        user = await db.scalar(select(User).where(User.username == "admin"))
        user_id = user.id
    for payload in [
        {"role_ids": [], "is_active": True},
        {"role_ids": [rbac.roles["admin"].id], "is_active": False},
    ]:
        response = await rbac.client.put(
            f"/api/rbac/users/{user_id}/access", headers=rbac.headers[1], json=payload
        )
        assert response.status_code == 409


@pytest.mark.anyio
@pytest.mark.parametrize("username", ["admin", " ADMIN ", "AdMiN"])
async def test_reserved_admin_cannot_be_claimed_from_public_or_managed_creation(
    rbac, username
):
    account = {"username": username, "password": "password123"}
    assert (
        await rbac.client.post("/api/auth/register", json=account)
    ).status_code == 409
    assert (
        await rbac.client.post(
            "/api/rbac/users",
            headers=rbac.headers[1],
            json={**account, "role_ids": [rbac.roles["admin"].id]},
        )
    ).status_code == 409


@pytest.mark.anyio
async def test_initialization_refuses_existing_admin_name_without_escalating_it(rbac):
    async with AsyncSession(rbac.bind) as db, db.begin():
        db.add(
            User(
                username="admin",
                password_hash="existing-hash",
                is_active=True,
                roles=[],
            )
        )
    with pytest.raises(ValueError, match="占用"):
        await migrate(rbac.bind, admin_password="new-initial-password")
    async with AsyncSession(rbac.bind) as db:
        user = await db.scalar(select(User).where(User.username == "admin"))
        assert user.permissions == []
        assert user.password_hash == "existing-hash"


def test_generated_image_owner_accepts_only_scoped_image_keys():
    assert generated_image_owner("users/12/designs/generated/assets/a.png") == 12
    assert generated_image_owner("users/12/designs/generated/assets/a.webp") == 12
    assert generated_image_owner("users/12/designs/generated/assets/../secret.png") is None
    assert generated_image_owner("users/12/designs/assets/a.png") is None
    assert generated_image_owner("users/12/designs/generated/assets/a.psd") is None
