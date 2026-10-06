import { AnimeGrid } from "@/components/AnimeGrid";
import { CalendarStrip } from "@/components/CalendarStrip";
import { HeroSpotlight } from "@/components/HeroSpotlight";
import { SITE_CONTAINER } from "@/lib/layout";

/**
 * 首页：焦点位 + 追番周表（一行）+ 热门新番（两行）。（三期改版后续会再加「高分合集」。）
 *
 * 版式（2026-10-07 三期改版）：**焦点位真全宽**——它直接铺满视口
 * （父级 <main> 本身就是满宽块级元素，不用 w-screen：那个含滚动条宽度，会出横向滚动条）。
 * 下面的区块统一收在 SITE_CONTAINER（1440px 宽版心）里，版心在全站只有这一个值，
 * 见 lib/layout.ts。⚠️ 焦点位不能放进容器：它的背景大图要从屏幕一边铺到另一边。
 *
 * 内容分工（详见各组件的头注释）：
 *   · 焦点位：当季人气前 HERO_COUNT 部轮播（口径见 lib/anime-constants.ts）；
 *   · 周表一行：今天起 7 天每天挑一部，完整周表在独立页 /calendar；
 *   · 热门新番：只显示 14 部，且**跳过焦点位那几部**（HERO_COUNT 起取），
 *     免同一部在首页出现两次；全量列表在 /updates。
 *
 * 数据都是「服务端外壳 + 客户端取数」：焦点位、新番墙、周表一行都取决于「此刻」
 * （人气排序、今天是哪一天），不能在服务端组件里算（会被构建那天烤死）。
 * 三个区块共用两个接口（/api/anime/season 经 useSeasonAnime 合并成一次请求、
 * /api/calendar 经 queryKey ["calendar"] 合并），都带 1 小时服务端缓存。
 */
export default function Home() {
  return (
    <main>
      <HeroSpotlight />
      <div className={SITE_CONTAINER}>
        <section className="mb-14">
          <CalendarStrip />
        </section>
        <AnimeGrid limit={14} showMore />
      </div>
    </main>
  );
}
