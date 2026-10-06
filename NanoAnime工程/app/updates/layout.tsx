import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "最近更新 · NanoAnime番鉴",
};

/**
 * /updates 的页面壳，只有一个职责：给这一页一个标题。
 *
 * 为什么需要它：page.tsx 是客户端组件（数据排序取决于「此刻」），
 * 而**客户端组件不能导出 metadata**——这是 Next 的规矩，写在页面里会构建报错。
 * 版式（main / 版心）都在 page.tsx 里，这里原样透传 children。
 */
export default function UpdatesLayout({ children }: LayoutProps<"/updates">) {
  return children;
}
