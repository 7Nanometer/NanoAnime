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
 * ⚠️ 名字**不是链接**。人物页本轮不做，做成链接点了会跳 404——宁可点了没反应。
 */
export function CastList({
  cast,
  missingCount,
}: {
  cast: CastMember[];
  /** 被排除掉的角色数（AniList 上没登记日语声优的）。界面要如实说出这个数字 */
  missingCount: number;
}) {
  if (cast.length === 0) {
    // ⚠️ 两种「空」是**两回事**，不能混成一句话说：
    //   ① 真没有角色（大鱼海棠：0 条）
    //   ② 有角色，但一个日语声优都没登记（灵笼：5 个角色，全是中文配音，
    //      而 AniList 的声优语言枚举**没有 CHINESE**，查不到中文声优）
    // 第 ② 种如果说成「还没有登记角色」就是在说假话——页面明明能列出角色。
    return (
      <p className="text-sm text-muted-foreground">
        {missingCount > 0
          ? `AniList 上有 ${missingCount} 个角色，但都没有登记日语声优。`
          : "暂无角色资料——AniList 上这部作品还没有登记角色。"}
      </p>
    );
  }

  const visible = cast.slice(0, CAST_LIMIT);

  return (
    <div className="flex flex-col gap-2">
      <ol className="divide-y divide-border rounded-lg border border-border">
        {visible.map((member) => (
          <li key={member.id} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
            <span className="break-words">
              {member.nameNative ?? member.nameFull ?? UNKNOWN_TITLE}
            </span>
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
        而反过来，千与千寻有 4 个角色没有声优——那 4 个不进名单，
        但**不能静默消失**，数字必须让用户看到。
      */}
      {missingCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          另有 {missingCount} 个角色暂无声优资料。
        </p>
      ) : null}

      <PersonNameNote />
    </div>
  );
}
