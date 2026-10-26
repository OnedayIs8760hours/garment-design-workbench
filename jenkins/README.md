# Jenkins 基础流水线测试

当前只验证两件事：从 Git 拉取代码，以及在控制台输出成功消息。

```text
jenkins/
├── Jenkinsfile    # 拉取代码 → 输出成功消息
└── README.md      # 最小配置说明
```

## 配置与运行

1. 创建 **Pipeline** 任务，Definition 选择 **Pipeline script from SCM**。
2. SCM 选择 Git，填写本项目仓库地址及对应的拉取凭据。
3. Branch Specifier 填 `*/main`。
4. Script Path 填 `jenkins/Jenkinsfile`，保存后点击 **Build Now**。

任务使用 `agent any`，可以在任意可用执行节点运行，无需设置 `linux`、`docker` 标签。
执行节点需在线、有可用执行器，并能使用 Git 访问仓库。
此版本不运行 npm、Python 测试、Docker 构建或部署，不需要安装这些工具或配置发布凭据。

## 预期结果

控制台出现以下内容，并以 `Finished: SUCCESS` 结束：

```text
代码拉取成功，Jenkins 基础流水线已跑通。
```

如果旧构建仍显示 `doesn't have label 'linux&&docker'`，先停止该构建，
确认任务拉取的是 `main` 分支，再点击 **Build Now**。已排队的旧构建不会自动使用新脚本。
旧任务若仍显示先前的发布参数，可在任务配置中取消“参数化构建过程”。

确认基础链路成功后，再逐步添加实际测试和部署。
节点语法参考 [Jenkins Pipeline 文档](https://www.jenkins.io/doc/book/pipeline/syntax/#agent)。
