import Link from "next/link";

import { PersonNameNote } from "@/components/PersonNameNote";
import { UNKNOWN_TITLE } from "@/lib/anime-display";
import type { CastMember } from "@/types/anime";

/**
 * 最多列几位声优。
 * AniList 一次给 25 个角色（嵌套连接的 perPage 实测被截断成 25），
 * 全列会让这一块比制作人员还长，取前 12 位主要角色就够。
 */
const CAST_LIMIT = 12;

/**
 * 声优名单。**以声优为主体**，角色名只是挂靠。
 *
 * 为什么不以角色为主体（这是实测定的，不是偏好）：角色名 **47.9% 连一个汉字都没有**，
 * 主角名常写成片假名（「エレン・イェーガー」「うちはサスケ」），中文读者认不出；
 * 而声优名 91% 是汉字。所以「人」当主体，「角色」当附注。
 *
 * 声优名链到 `/person/[id]`（人物页在 M5-1-1 下半场做好后接上的）——
 * 和制作人员块同一个路由、同一套 id。
 */
export function CastList({
  cast,
  missingCount,
}: {
  cast: CastMember[];
  /**
   * 被排除掉的角色数（AniList 上没登记日语声优的）。
   *
   * ⚠️ 只用它**判断说哪句话**，**绝不把数字显示出来**——它数的是"拿到的那些角色边"
   * （嵌套连接 perPage 被静默截断在 25，见宪法第 14 条），是**技术上限、不是业务事实**。
   * 反例：灵笼真实 48 个角色，按这个数会说成 25。详见验收文件的通用纪律
   * 「不要在界面上说「共 N 个」」。
   */
  missingCount: number;
}) {
  if (cast.length === 0) {
    // ⚠️ 两种「空」是**两回事**，不能混成一句话说：
    //   ① 真没有角色（大鱼海棠：0 条）
    //   ② 有角色，但一个日语声优都没登记（灵笼：48 个角色，全是中文配音，
    //      而 AniList 的声优语言枚举**没有 CHINESE**，查不到中文声优）
    // 第 ② 种如果说成「还没有登记角色」就是在说假话——页面明明能列出角色。
    // 措辞刻意**不带数字**：那是从被截断的数据里数出来的（理由见上面 missingCount 的注释）
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        {missingCount > 0
          ? "这部作品在 AniList 上暂时查不到日语声优资料。"
          : "暂无角色资料——AniList 上这部作品还没有登记角色。"}
      </p>
    );
  }

  const visible = cast.slice(0, CAST_LIMIT);

  return (
    <div className="flex flex-col gap-2">
      <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface/50">
        {visible.map((member) => (
          <li
            key={member.id}
            className="flex flex-col gap-0.5 px-3.5 py-2.5 text-sm transition-colors duration-150 hover:bg-brand-tint"
          >
            {/* 声优名点进人物页（和制作人员块同一个 /person/[id]） */}
            <Link
              href={`/person/${member.id}`}
              className="w-fit break-words decoration-brand/50 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {member.nameNative ?? member.nameFull ?? UNKNOWN_TITLE}
            </Link>
            {member.nameNative && member.nameFull ? (
              <span className="break-words text-xs text-muted-foreground">
                {member.nameFull}
              </span>
            ) : null}
            {/*
              角色名是**附注**，不是主体。实测它可能是 null（不渲染整行），
              也可能整串都是假名——读不出也不影响用户认出这位声优是谁。
            */}
            {member.characterName ? (
              <span className="break-words text-xs text-muted-foreground">
                配音：{member.characterName}
              </span>
            ) : null}
          </li>
        ))}
      </ol>

      {cast.length > CAST_LIMIT ? (
        <p className="text-xs text-muted-foreground">
          只列出前 {CAST_LIMIT} 位主要角色的声优。
        </p>
      ) : null}

      {/*
        ⚠️ 这行**不能写死**。实测有整部番的角色全都有声优的情况
        （进击的巨人、BLEACH、钢炼 FA 这一批都是），
        写死就会出现「另有 0 个角色暂无声优资料」这种句子。
        而反过来，千与千寻有角色没有声优——那些角色不进名单，
        但**不能静默消失**，必须有一行如实说明。

        ⚠️ 措辞**不带数字**：原来写「另有 4 个角色暂无声优资料」，
        那个 4 是从被截断的数据里数出来的（角色 > 25 时不准）。
        **说一个错的数字比不说更糟**——详见验收文件的通用纪律。
      */}
      {missingCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          另有部分角色暂无声优资料。
        </p>
      ) : null}

      <PersonNameNote />
    </div>
  );
}
