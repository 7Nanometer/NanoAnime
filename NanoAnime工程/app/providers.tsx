"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

// TanStack Query 的全局 Provider：把「查询缓存」挂到整棵组件树上，
// 让所有页面共享同一份缓存，同一个接口不会重复请求。
// TanStack Query 是客户端库，必须标 "use client" 才能用。
export function Providers({ children }: { children: ReactNode }) {
  // 用 useState 保证 QueryClient 在浏览器里只创建一次。
  // 若直接写在组件体里，每次渲染都会新建，缓存会一直丢。
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 1 小时内视为「新鲜」，不重新请求——与 CLAUDE.md 第五条的服务端缓存对齐
            staleTime: 60 * 60 * 1000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
