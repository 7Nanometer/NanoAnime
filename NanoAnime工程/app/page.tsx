import { AnimeGrid } from "@/components/AnimeGrid";
import { CalendarBoard } from "@/components/CalendarBoard";
import { HeroSpotlight } from "@/components/HeroSpotlight";

/**
 * 首页：焦点位 + 追番周表 + 当季全部新番。
 *
 * 2026-10-06 M7 改版：原来的「日历」是一个独立页面，现在并进首页成为中部区块，
 * `/calendar` 由 next.config.ts 里的 308 跳转指到这里的 #calendar 锚点。
 *
 * 三块都是「服务端外壳 + 客户端取数」：
 *   - 焦点位和周表都取决于「此刻」（人气排序、今天是哪一天），不能在服务端组件里
 *     算（会被构建那天烤死），所以数据在客户端取——焦点位与下面的新番墙共用
 *     同一个接口（/api/anime/season，经 useSeasonAnime 合并成一次请求），
 *     周表走 /api/calendar（那个接口不许加 force-dynamic，原因见注释）；
 *   - 三个接口都带 1 小时服务端缓存。
 *
 * ⚠️ id="calendar" 的外壳（section）必须包在**所有状态的外面**——加载中、出错时
 * 也要存在于首屏 HTML 里。否则带 #calendar 的地址（含 308 跳过来的）在首屏
 * 找不到锚点目标，浏览器就不会滚动。避开吸顶栏靠的是 layout 里的
 * scrollPaddingTop（html 上已设 5rem），这里不要再叠加 scroll-margin，
 * 两个偏移会叠起来、落点偏下。
 */
export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <HeroSpotlight />
      <section id="calendar" className="mb-14">
        <CalendarBoard />
      </section>
      <AnimeGrid />
    </main>
  );
}
