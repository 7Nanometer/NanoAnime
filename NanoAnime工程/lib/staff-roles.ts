// 制作人员职位的「归一化 + 中文对照」。
//
// ⚠️ 为什么需要归一化：AniList 的职位名是**自由文本**，实测 20 部番里出现 **150 种**
// 不同写法，而且大量带集数后缀：
//     Director (eps 1-479)
//     Series Composition (eps 1-135)
//     Script  (eps 5, 9, 10, 15, 16, 20)     ← 注意是两个空格
//     Animation Director (eps 290, 298, 309, …)   ← 括号长到几十个集号
// 不处理的话，同一张映射表会大面积失配。
//
// 实测：不去括号 → 149 种，前 40 条映射只覆盖 72.8%；
//       去掉括号后 → 81 种，同样 40 条覆盖 **89.0%**。
//
// ⚠️ 没命中映射表的一律**原样显示英文**（见文件末尾的说明），不硬翻、不猜。

/**
 * 去掉职位名里的括号内容，并压掉多余空格。
 *
 * 例：`Director (eps 1-479)` → `Director`；`Music ` → `Music`。
 * 万一整个字符串都在括号里（理论上不该出现），退回原文，免得归一化成一个空串。
 */
export function normalizeRole(role: string): string {
  const stripped = role
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > 0 ? stripped : role.trim();
}

/**
 * 职位名 → 中文。键是**归一化之后**的名字。
 *
 * 这份表的选法：取实测里出现次数最多的那批（前 40 种覆盖 89%）。
 * 长尾（只出现一两次的）不收——收了也覆盖不了多少，反而让表变得难维护。
 *
 * ⚠️ `Knightmare Design`（《鲁路修》专有的机体设计职称）、`Creative Advisor`、
 * `Monitor Works` 这类**故意不收**：它们是作品专属或很偏的写法，
 * 硬翻成中文反而失真。原样显示英文更准确。
 */
const ROLE_LABELS: Record<string, string> = {
  // ── 最核心的那几位（实测：平均落在第 1~8 位）─────────────
  "Original Creator": "原作",
  "Original Story": "原案",
  "Original Character Design": "原创人物设计",
  Director: "监督",
  "Chief Director": "总监督",
  "Assistant Director": "副监督",
  "Series Composition": "系列构成",
  "Script Composition": "编剧统筹",
  Script: "编剧",
  Supervisor: "监修",
  "Character Design": "人物设计",
  "Sub Character Design": "次要人物设计",
  "Mechanical Design": "机械设计",
  "Prop Design": "道具设计",
  "Art Director": "美术监督",
  "Art Design": "美术设计",
  "Art Board": "美术板",
  "Background Art": "背景美术",
  "Color Design": "色彩设计",
  "Director of Photography": "摄影监督",
  "Sound Director": "音响监督",
  "Sound Effects": "音响效果",
  "Sound Effects Assistance": "音响效果协助",
  "Sound Production": "音响制作",
  Music: "音乐",
  "Music Producer": "音乐制片人",
  "Music Production": "音乐制作",
  "Music Production Assistance": "音乐制作协助",
  Editing: "剪辑",
  "Video Editing": "视频剪辑",
  "Chief Animation Director": "总作画监督",
  "Animation Director": "作画监督",
  "Main Animator": "主动画师",
  "Key Animation": "原画",
  "2nd Key Animation": "第二原画",
  "In-Between Animation": "动画",
  "Episode Director": "分集演出",
  Storyboard: "分镜",
  "CG Director": "CG 监督",
  "CG Producer": "CG 制片",
  "Special Effects": "特殊效果",
  "Literary Arts": "文艺",
  "Design Manager": "设计管理",
  "Title Logo Design": "标题设计",
  "Theme Song Performance": "主题歌演唱",
  "Theme Song Lyrics": "主题歌作词",
  "Theme Song Composition": "主题歌作曲",
  "Theme Song Arrangement": "主题歌编曲",
  "Insert Song Performance": "插曲演唱",
  "Insert Song Lyrics": "插曲作词",
  // ── 制片 / 企划这一档（实测：平均落在第 12~20 位）──────────
  Producer: "制片人",
  "Executive Producer": "执行制片人",
  "Animation Producer": "动画制片人",
  "Associate Producer": "副制片人",
  "Planning Producer": "企划制片人",
  "Advertising Producer": "广告制片人",
  Planning: "企划",
  "Planning Assistance": "企划协助",
  Production: "制作",
  "Production Desk": "制作统筹",
  "Production Office": "制作事务",
  Advertising: "广告",
  Recording: "录音",
  "Recording Adjustment": "录音调整",
  "Recording Assistant": "录音协助",
};

/**
 * 职位名 → 显示用的中文。
 *
 * **命中映射表就显示中文；没命中就原样返回归一化后的英文**——
 * 不返回空串、不硬翻（硬翻出来的中文比英文原文更难认）。
 */
export function getRoleLabel(role: string): string {
  const key = normalizeRole(role);
  return ROLE_LABELS[key] ?? key;
}

/**
 * 人物页「职位标签」（AniList 的 `primaryOccupations`）用的中文表。
 *
 * ⚠️ **这是另一套词汇**，和上面的职位名不是一批：上面是「在某部作品里干了什么」
 * （`Director (eps 1-479)`、`Key Animation (ep 3)`…），这里是「这个人的职业」
 * （Director / Voice Actor / Animator / Mangaka…）。
 *
 * 实测口径（2026-10-06，抽 32 人：12 位名人 + 20 位从《进击的巨人》staff 深页取的冷门人）：
 * 出现 **13 种**取值，而原职位表只覆盖其中 1 种（Director）——所以单开这一张。
 * 补表后 **13/13 全命中**。频率：Animator ×14、Director ×9、Voice Actor ×6、Designer ×5、
 * Storyboard Artist ×4、Mangaka ×4，其余 7 种各 1~3 次。
 *
 * 为什么**不并进上面那张表**：并进去会顺手改变详情页制作人员的显示
 * （有番的 staff 职位就叫 `Animator` 之类的话），那是本页之外的行为变化，不该捎带。
 */
const OCCUPATION_LABELS: Record<string, string> = {
  Animator: "动画师",
  Director: "监督",
  "Voice Actor": "声优",
  Designer: "设计师",
  "Storyboard Artist": "分镜",
  Mangaka: "漫画家",
  // Writer 和 Scriptwriter 分开译：中文语境里「编剧」对应脚本岗（Scriptwriter），
  // Writer 更宽（也写小说/原案），译「作者」既不与前者重复、也不至于失真
  Scriptwriter: "编剧",
  Writer: "作者",
  Composer: "作曲",
  Lyricist: "作词",
  Vocalist: "歌手",
  Musician: "音乐家",
  // ADR = 后期配音（Automated Dialogue Replacement），这个人管配音录制
  "ADR Director": "配音监督",
};

/** 职业标签 → 中文。没命中原样英文（同职位名的规则，不硬翻） */
export function getOccupationLabel(occupation: string): string {
  const key = occupation.trim();
  return OCCUPATION_LABELS[key] ?? key;
}

/**
 * 作品行里的职位串：**先归一化（去括号）→ 再去重 → 最多 max 个，其余折成「+N」**。
 *
 * 口径顺序不能换，实测反例：《ギルティクラウン》里澤野弘之有 8 条登记，
 * 其中 6 条归一化后都是同一个标签（`Insert Song Composition ("Bios"; ep 1)` →
 * `Insert Song Composition`）——**不去重会数成「+5」，是错的**；去重后只剩 2 个标签。
 *
 * 详情页的制作人员块**不用这个函数**（那边是「全列、不折叠」，行为不能变）——
 * 这是人物页作品行专用的。
 */
export function formatRolesLimited(roles: readonly string[], max = 3): string | null {
  const labels: string[] = [];
  for (const role of roles) {
    if (role.trim().length === 0) {
      continue;
    }
    const label = getRoleLabel(role);
    if (!labels.includes(label)) {
      labels.push(label);
    }
  }

  if (labels.length === 0) {
    return null;
  }
  if (labels.length <= max) {
    return labels.join(" / ");
  }
  return `${labels.slice(0, max).join(" / ")} +${labels.length - max}`;
}

/**
 * 把**一个人的多个职位**拼成显示用的那一行（AniList 会把身兼多职的人拆成多条边）。
 *
 * ⚠️ 职位为空时返回 **null**，不是空串——界面据此**整行不渲染**。
 * 否则会渲染出「小林靖子 · 」这种残缺格式（实测有人确实没有职位字段）。
 */
export function formatRoles(roles: readonly string[]): string | null {
  const labels = roles
    .filter((role) => role.trim().length > 0)
    .map((role) => getRoleLabel(role));
  return labels.length > 0 ? labels.join(" / ") : null;
}
