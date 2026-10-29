# 云端 DEV 测试环境

访问地址：`https://38.22.234.43:8081`。生产仍使用 `8080`。

Jenkins 的 `batchforge-dev-deploy` 任务监听 `*/dev`，使用同一个
`jenkins/Jenkinsfile`，测试、构建通过后才部署。生产任务仍监听 `main`。
当前分支合并到 dev 不包含原工作区未提交的修改。

## 隔离与运行配置

- 代码目录 `/opt/sds-design-dev`；Compose 项目 `sds-design-dev`。
- 配置文件 `/opt/sds-design-dev/deploy/test/.env`，权限 `600`，已加入 Git 忽略。
- 独立数据库、两组 Redis、RustFS 容器、网络、数据卷及应用镜像名。
- JWT、数据库、缓存、对象存储密钥独立生成，不复制生产用户或订单数据。
- Nacos 注册关闭；`/erp/` 返回 503，待准备 ERP 测试服务后再接入。
- 模型供应商参数沿用服务器现有配置；实际调用仍计入该供应商账号。
- HTTPS 复用现有 IP 证书；RustFS API 和控制台端口只绑定回环地址。
- 服务限制内存及 CPU，镜像串行构建；同机部署仍共享宿主机资源。

首次配置以 `.env.example` 为参考，配置模型供应商并生成随机密钥，再运行：

```bash
bash /opt/sds-design-dev/deploy/test/deploy.sh
```

脚本校验环境隔离、构建并启动服务，初始化私有存储桶，验证 HTTPS、API 和存储。
测试数据库初始为空，使用测试账号注册流程准备账号，不复用生产账号密码。

## Jenkins 部署权限

Jenkins 用户使用 `~/.ssh/sds_design_deploy_dev`，服务器公钥配置为：

```text
restrict,command="/usr/local/sbin/sds-design-deploy-dev" ssh-ed25519 <public-key>
```

服务器入口固定设置 `SDS_DEPLOY_ENV=dev`，再执行安装后的
`jenkins/scripts/deploy-receiver.sh`；dev 密钥不能选择生产目录。
接收器验证提交一致性，只允许快进更新，以独立文件锁串行部署，
成功后写入 `/var/lib/sds-design-dev/deployed-revision`。

查看状态与日志：

```bash
cd /opt/sds-design-dev/deploy
docker compose --env-file test/.env -f docker-compose.yml -f test/docker-compose.yml ps
docker compose --env-file test/.env -f docker-compose.yml -f test/docker-compose.yml logs --tail=100 backend agent
```

部署不会自动回滚应用或数据库；失败时先查看 Jenkins 报告与容器日志。
不要对任何环境运行 `down --volumes`，它会删除对应环境的数据。
