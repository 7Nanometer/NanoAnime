import type { Metadata } from "next";
import Link from "next/link";

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
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← 返回本季新番
      </Link>

      <h1 className="mt-6 text-2xl font-semibold">我的追番</h1>

      <div className="mt-6">
        <MyCollection />
      </div>
    </main>
  );
}
