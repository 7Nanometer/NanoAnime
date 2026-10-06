import type { Metadata } from "next";

import { MyCollection } from "@/components/MyCollection";

export const metadata: Metadata = {
  title: "我的追番 · NanoAnime番鉴",
};

/**
 * 我的追番页。
 *
 * 和服务端取数的详情页不同，这里是**服务端外壳 + 客户端读本地**——
 * 追番记录存在浏览器 localStorage 里，服务端根本看不到，
 * 所以页面本身没有数据可取，交给 MyCollection 在浏览器里读。
 */
export default function MyPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
      <header className="mb-6">
        <h1 className="section-mark text-2xl font-bold tracking-tight">我的追番</h1>
      </header>

      <MyCollection />
    </main>
  );
}
