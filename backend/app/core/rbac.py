"""RBAC 权限目录与内置角色默认授权。

权限码由代码定义，角色只负责组合已有权限；管理接口不能创建任意权限码。
新增业务权限时，需要同时在对应接口接入校验，单独添加目录不会保护接口。
"""

SYSTEM_ADMIN_USERNAME = "admin"


def is_system_admin_name(username: str) -> bool:
    """专有账号名不区分大小写，公开注册和普通用户创建入口均须保留该名称。"""
    return username.strip().casefold() == SYSTEM_ADMIN_USERNAME


PERMISSIONS = {
    "designs.read": ("查看设计", "读取自己的设计草稿"),
    "designs.write": ("编辑设计", "创建、保存和删除自己的设计草稿"),
    "assets.read": ("查看素材", "读取和下载自己的图片素材"),
    "assets.write": ("管理素材", "上传和删除自己的图片素材"),
    "psd.upload": ("上传 PSD", "创建、上传和管理自己的 PSD 上传会话"),
    "ai.generate": ("使用 AI", "对话、生图及管理 AI 会话"),
    "rbac.manage": ("权限管理", "管理用户、角色和授权，查看授权记录"),
}

# 这些集合用于首次创建角色；迁移不会反复覆盖设计师或只读角色的自定义授权。
# 管理员是受保护的恢复入口，始终拥有目录中的全部权限。
BUILTIN_ROLES = {
    "admin": ("管理员", set(PERMISSIONS)),
    "designer": ("设计师", set(PERMISSIONS) - {"rbac.manage"}),
    "viewer": ("只读成员", {"designs.read", "assets.read"}),
}
