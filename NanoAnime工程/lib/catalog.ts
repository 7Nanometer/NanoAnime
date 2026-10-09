// 「全库计数」的运行时入口：读 data/catalog-counts.json（scripts/build-catalog.ts 生成）。
//
// 为什么浏览页的「共 N 部」要另立门户，不用 AniList 返回的 pageInfo.total：
// 那个数字会撒谎——实测同一查询翻到不同页会报出不同的总数（第 1 页报 5000、
// 第 200 页报 4975），连「1960 年前只有百来部」它也报 5000。一个数都不能信。
// 这份计数是把全库两万条**逐条扫出来数的**（ID 区间扫描，绕开了数据源的
// 5000 分页上限，见 scripts/build-catalog.ts），是站点里唯一干净的总数来源。
//
// ⚠️ 只被服务端组件引用——它带着分年计数的 JSON，别进客户端 bundle。
// ⚠️ 与 lib/browse.ts 的年份维度必须同源：年代档的边界直接引用 DECADE_BUCKETS，
//    改档位时这里跟着变，不会各说各话。

import rawCounts from "@/data/catalog-counts.json";
import { DECADE_BUCKETS, EARLIER_UNTIL } from "@/lib/browse";

/** catalog-counts.json 的结构（由 build-catalog 生成，键序见该脚本） */
interface CatalogCounts {
  generatedAt: string;
  /** 全库总条目数（非成人动画、全年代全国家） */
  total: number;
  /** 没有放送年份的条目数（计入 total，但不落在任何年份档里） */
  undated: number;
  /** 分年计数，键是四位年份的字符串 */
  byYear: Record<string, number>;
}

const COUNTS = rawCounts as CatalogCounts;

/**
 * 按「年份筛选值」取全库真实条目数：
 *   ""        → 全库总数
 *   "2015"    → 该年
 *   "1990s"   → 该年代档（区间取 lib/browse.ts 的 DECADE_BUCKETS）
 *   "earlier" → 1970 年以前的合计
 * 认不出的值返回 null（调用方据此**不显示数字**——宁可不说，不说假话）。
 */
export function getCatalogCount(yearValue: string): number | null {
  if (yearValue === "") {
    return COUNTS.total;
  }
  if (yearValue === "earlier") {
    return sumYears(0, EARLIER_UNTIL);
  }
  const bucket = DECADE_BUCKETS.find((item) => item.value === yearValue);
  if (bucket) {
    return sumYears(bucket.from, bucket.to);
  }
  if (/^\d{4}$/.test(yearValue)) {
    // 清点是全量扫描——不在表里就是真的 0 条（不是"没数过"）
    return COUNTS.byYear[yearValue] ?? 0;
  }
  return null;
}

/** 汇总 byYear 里 [from, to] 闭区间的条目数 */
function sumYears(from: number, to: number): number {
  let sum = 0;
  for (const [year, count] of Object.entries(COUNTS.byYear)) {
    const value = Number(year);
    if (value >= from && value <= to) {
      sum += count;
    }
  }
  return sum;
}
