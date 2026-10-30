// 只信任后端返回的权限码，不根据角色显示名推断权限；资料缺失时默认拒绝。
// 这些判断控制界面可见性，实际访问权限仍由后端逐次校验。
export function can(user, permission) {
  return (
    Array.isArray(user?.permissions) && user.permissions.includes(permission)
  );
}

export function canEditDesign(user) {
  // 编辑器会先加载草稿再自动保存，单有写权限不足以使用完整编辑流程。
  return can(user, "designs.read") && can(user, "designs.write");
}

// 一个页面可依赖多项能力；数组内权限全部满足才开放入口。
// home 的空列表允许已登录但尚未授权的成员看到提示和退出入口。
const SECTION_PERMISSIONS = {
  home: [],
  products: ["designs.read", "designs.write"],
  design: ["designs.read"],
  assets: ["assets.read", "designs.read"],
  generate: ["ai.generate", "assets.write"],
  orders: ["designs.write"],
  finished: ["designs.read"],
  permissions: ["rbac.manage"],
  all_content: ["designs.read", "assets.read", "rbac.manage"],
};

export function canAccessSection(user, section) {
  if (!user) return false;
  // 管理角色只管理授权；跨用户数据范围专属于固定的最高权限账号。
  if (section === "all_content" && user.is_system_admin !== true) return false;
  // 只接受明确声明的页面，避免把原型链上的属性误当作页面配置。
  const permissions = Object.hasOwn(SECTION_PERMISSIONS, section)
    ? SECTION_PERMISSIONS[section]
    : null;
  return (
    Boolean(permissions) &&
    permissions.every((permission) => can(user, permission))
  );
}
