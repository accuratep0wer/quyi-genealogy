# 相声师承谱系（静态网站）

根据公开资料整理的中国相声演员师承谱系，从清末到当代，收录正式师承，代拉、引保代、口盟等关系，以及亲缘和姻缘关系。纯静态站点，不需要构建，可以直接部署到 GitHub Pages（支持子路径，例如 `https://<user>.github.io/<repo>/`）。

- `index.html`：单页应用，含图谱、人物表、关系表、说明与来源四个视图（hash 路由，`#graph/<id>` 可以直接链接到某个人物）
- `data/people.json`：人物数据（id、姓名、别名、代数、字辈、生卒年、备注、来源）
- `data/relations.json`：关系数据（type：`master_disciple` | `kin` | `marriage` | `other`；from、to、detail、sources、confidence：`documented` | `disputed`、notes）
- `data/layout.json`：离线预先计算的力导向布局坐标
- `vendor/cytoscape.min.js`：Cytoscape.js（MIT，许可证见 `vendor/LICENSE-cytoscape.txt`）

本地预览：`python3 -m http.server` 后访问 `http://localhost:8000/`。

数据许可：主干整理自维基百科（CC BY-SA 4.0），因此 `data/` 目录下的数据按 CC BY-SA 4.0 发布，转载时请保留出处。交叉核对参考了 [jammyfu/xiangsheng-genealogy](https://github.com/jammyfu/xiangsheng-genealogy)（MIT）。每条记录都附有来源链接，详见站内“说明与来源”。

许可全文见仓库根目录 `LICENSE`：

- `data/`：整理自维基百科，CC BY-SA 4.0。转载或改编请保留本说明里的出处以及每条记录的来源。
- 本仓库代码（`index.html`、`assets/`、`tools/`）：MIT。
- `vendor/cytoscape.min.js`：Cytoscape.js 仍使用其自带的 MIT 许可证，全文在 `vendor/LICENSE-cytoscape.txt`，须与该文件一并保留。
