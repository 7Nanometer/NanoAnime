import type { Metadata } from "next";
import Link from "next/link";

import { AnimeSearch } from "@/components/AnimeSearch";

export const metadata: Metadata = {
  title: "搜索 · NanoAnime番鉴",
};

/**
 * 搜索页。
 *
 * 这是**服务端组件，但页面上一个数据都不取**——搜索是用户敲字触发的交互，
 * 由客户端组件 AnimeSearch 按需请求 /api/search。
 * 服务端渲染时还不知道用户要搜什么，硬取数据没有意义。
 */
export default function SearchPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← 返回本季新番
      </Link>

      <h1 className="mt-6 text-2xl font-semibold">搜索番剧</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        中文、日文原名、英文名都可以搜。点击结果进详情页。
      </p>

      <AnimeSearch />
    </main>
  );
}
