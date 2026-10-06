import { AnimeGrid } from "@/components/AnimeGrid";
import { CalendarBoard } from "@/components/CalendarBoard";
import { HeroSpotlight } from "@/components/HeroSpotlight";
import { SITE_CONTAINER } from "@/lib/layout";

/**
 * 首页：焦点位 + 追番周表 + 当季新番（三期改版后续会再加「高分合集」）。
 *
 * 版式（2026-10-07 三期改版）：**焦点位真全宽**——它直接铺满视口
 * （父级 <main> 本身就是满宽块级元素，不用 w-screen：那个含滚动条宽度，会出横向滚动条）。
 * 下面的区块统一收在 SITE_CONTAINER（1440px 宽版心）里，版心在全站只有这一个值，
 * 见 lib/layout.ts。⚠️ 焦点位不能放进容器：它的背景大图要从屏幕一边铺到另一边。
 *
 * 数据都是「服务端外壳 + 客户端取数」：焦点位与新番墙共用 /api/anime/season
 * （useSeasonAnime 合并成一次请求），周表走 /api/calendar——两边都取决于「此刻」
 * （人气排序、今天是哪一天），不能在服务端组件里算（会被构建那天烤死）。
 * 接口都带 1 小时服务端缓存。
 */
export default function Home() {
  return (
    <main>
      <HeroSpotlight />
      <div className={SITE_CONTAINER}>
        <section className="mb-14">
          <CalendarBoard />
        </section>
        <AnimeGrid />
      </div>
    </main>
  );
}
