// Bangumi（番组计划）相关的类型定义。
// Bangumi 在本项目里只负责一件事：提供中文名。封面、评分等仍以 AniList 为准。

/**
 * Bangumi 搜索接口返回的一条作品。字段名为 Bangumi 原样，没用到的不列。
 *
 * ⚠️ 这三个字段都可能为 null——**实测踩过坑**：搜「薬屋のひとりごと 亡妃の秘宝」时
 * 有候选的 name_cn 直接返回 null，照 `string` 处理会当场抛
 * `Cannot read properties of null (reading 'trim')`，整轮脚本白跑。
 */
export interface BangumiSubject {
  id: number;
  /** 原名，通常就是日文原名 */
  name: string | null;
  /** 中文名。为 null 或空串时这条对我们没用 */
  name_cn: string | null;
  /** 放送开始日期，形如 "2023-09-29"；也可能只有 "2026" 或直接为 null */
  date: string | null;
  /**
   * 中文简介。**Bangumi 的简介是用户众筹写的，不是每部都有**，实测可能为 null 或空串。
   * 用途：详情页的简介优先用它（中文），拿不到才退回 AniList 的英文简介。
   */
  summary: string | null;
}

/** 搜索接口的返回外形 */
export interface BangumiSearchResponse {
  data: BangumiSubject[];
  total: number;
}

/**
 * `data/title-zh.json` 里的一条记录：AniList 的 id → 中文名。
 * 匹配失败的作品**不会**出现在文件里（不是留一条空的）——这样"有没有配对上"一眼可查。
 */
export interface BangumiIndexEntry {
  /** Bangumi 上的作品 id，出问题时方便去 https://bgm.tv/subject/{id} 人工核对 */
  bangumi_id: number;
  /** 中文名 */
  title_zh: string;
  /**
   * 中文简介。**Bangumi 上没填时是 null**（不写空串——和项目里「缺数据就是 null」的习惯一致）。
   * 旧版的 title-zh.json 里没有这个键，所以读取时要按「可能没有」处理。
   */
  summary: string | null;
  /**
   * AniList 的人气值（多少人看过 / 想看）。**搜索排序用**：
   * 搜中文时，同一个匹配档位内按它从高到低排（规则见 lib/local-match-rank.ts）。
   *
   * 来源是 AniList 而不是 Bangumi——Bangumi 只负责中文名，别把两边的数据搞混。
   * 旧版的 title-zh.json 里没有这个键，所以读取时同样要按「可能没有」处理。
   */
  popularity: number | null;
}

/** `data/title-zh.json` 的整体结构，键是 AniList 的 id（字符串形式，JSON 的键只能是字符串） */
export type BangumiIndex = Record<string, BangumiIndexEntry>;
