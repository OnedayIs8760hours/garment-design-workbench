CREATE TABLE IF NOT EXISTS users (

    -- 主键
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- 用户名
    username VARCHAR(64) NOT NULL,

    -- 密码哈希
    password_hash TEXT NOT NULL,

    -- 职位
    job_title VARCHAR(100),

    -- 是否启用
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- 创建时间
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 更新时间
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 最后登录时间
    last_login_at TIMESTAMPTZ
);

-- 每个用户在每个模板下的一份设计草稿，design_data 保存前端完整设计 JSON。
CREATE TABLE IF NOT EXISTS design_drafts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id VARCHAR(128) NOT NULL,
    order_id VARCHAR(128) NOT NULL,
    template_version INTEGER NOT NULL DEFAULT 1,
    design_data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_design_drafts_user_template_order UNIQUE (user_id, template_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_design_drafts_user_id ON design_drafts(user_id);
