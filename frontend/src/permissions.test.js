import assert from "node:assert/strict";
import test from "node:test";
import { can, canAccessSection, canEditDesign } from "./permissions.js";

test("权限缺失时拒绝业务入口和未知页面", () => {
  assert.equal(can(null, "designs.write"), false);
  assert.equal(canAccessSection(null, "home"), false);
  assert.equal(canAccessSection({}, "permissions"), false);
  for (const section of ["unknown", "__proto__", "toString"])
    assert.equal(canAccessSection({}, section), false);
});

test("只读成员可查看设计素材，不能编辑、生成或管理授权", () => {
  const viewer = { permissions: ["designs.read", "assets.read"] };
  for (const section of ["home", "design", "assets", "finished"])
    assert.equal(canAccessSection(viewer, section), true);
  for (const section of ["products", "generate", "orders", "permissions"])
    assert.equal(canAccessSection(viewer, section), false);
  assert.equal(canEditDesign(viewer), false);
  assert.equal(canEditDesign({ permissions: ["designs.write"] }), false);
});

test("管理入口与业务权限独立，AI 入口要求素材保存权限", () => {
  const manager = { permissions: ["rbac.manage"] };
  assert.equal(canAccessSection(manager, "permissions"), true);
  assert.equal(canEditDesign(manager), false);
  assert.equal(
    canAccessSection({ permissions: ["ai.generate"] }, "generate"),
    false,
  );
  assert.equal(
    canAccessSection(
      { permissions: ["ai.generate", "assets.write"] },
      "generate",
    ),
    true,
  );
});
