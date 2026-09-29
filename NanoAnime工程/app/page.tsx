import { AnimeGrid } from "@/components/AnimeGrid";

// 首页：本季新番封面墙。数据由 AnimeGrid 在客户端从 /api/anime/season 取。
export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <AnimeGrid />
    </main>
  );
}
