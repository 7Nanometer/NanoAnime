import { AnimeGrid } from "@/components/AnimeGrid";
import { CalendarStrip } from "@/components/CalendarStrip";
import { HeroSpotlight } from "@/components/HeroSpotlight";
import { HighScoreCollections } from "@/components/HighScoreCollections";
import { SeasonTopRail } from "@/components/SeasonTopRail";
import { getTopCollections } from "@/lib/collections-index";
import { HOME_WALL_COUNT } from "@/lib/anime-constants";
import { SITE_CONTAINER } from "@/lib/layout";

/**
 * 首页：焦点位 + 追番周表（一行）+ 热门新番（两行）+ 本季遗珠（横滑轨）+ 高分合集。
 *
 * 版式（2026-10-07 三期改版）：**焦点位真全宽**——它直接铺满视口
 * （父级 <main> 本身就是满宽块级元素，不用 w-screen：那个含滚动条宽度，会出横向滚动条）。
 * 下面几块统一收在 SITE_CONTAINER（1440px 宽版心）里，版心在全站只有这一个值，
 * 见 lib/layout.ts。⚠️ 焦点位不能放进容器：它的背景大图要从屏幕一边铺到另一边。
 *
 * 节奏（2026-10-09 电影化改版）：版面按"大 → 小 → 大"的间隔收放，不再是
 * 一排等距的区块——周表（mb-16）→ 新番墙（mb-16）→ 遗珠轨（mb-20，把
 * "本季"和"全年代"两组内容分开）→ 高分合集。间隔值刻意只有三档，
 * 不逐块微调——"每一处都不一样"不叫节奏，叫没规矩。
 *
 * 内容分工（详见各组件的头注释）：
 *   · 焦点位：当季人气前 HERO_COUNT 部轮播（口径见 lib/anime-constants.ts）；
 *   · 周表一行：今天起 7 天每天挑一部，完整周表在独立页 /calendar；
 *   · 热门新番：只显示 HOME_WALL_COUNT 部，且**跳过焦点位那几部**（HERO_COUNT 起取），
 *     免同一部在首页出现两次；全量列表在 /updates；
 *   · 本季遗珠：跳过焦点位+新番墙后、按 Bangumi 评分取前几部（口径见 SeasonTopRail 头注释）；
 *   · 高分合集：全年代系列合集的 Bangumi 均分榜（只收日本动画，2026-10-07 口径），
 *     数据是**离线脚本生成的文件**
 *     （这里服务端读 data/collections.json 后当 props 传下去——运行时不联网）。
 *
 * 数据都是「服务端外壳 + 客户端取数」：焦点位、新番墙、周表一行都取决于「此刻」
 * （人气排序、今天是哪一天），不能在服务端组件里算（会被构建那天烤死）。
 * 两个接口（/api/anime/season 经 useSeasonAnime 合并成一次请求、/api/calendar
 * 经 queryKey ["calendar"] 合并）都带 1 小时服务端缓存；高分合集不走接口、走本地文件。
 */
export default function Home() {
  const collections = getTopCollections();

  return (
    <main>
      <HeroSpotlight />
      <div className={SITE_CONTAINER}>
        <div className="mb-16">
          <CalendarStrip />
        </div>
        <div className="mb-16">
          <AnimeGrid limit={HOME_WALL_COUNT} showMore />
        </div>
        <div className="mb-20">
          <SeasonTopRail />
        </div>
        <HighScoreCollections collections={collections} />
      </div>
    </main>
  );
}
