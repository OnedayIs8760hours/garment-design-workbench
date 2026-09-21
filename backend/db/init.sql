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