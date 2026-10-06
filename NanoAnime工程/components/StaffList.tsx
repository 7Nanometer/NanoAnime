import { PersonNameNote } from "@/components/PersonNameNote";
import { UNKNOWN_TITLE } from "@/lib/anime-display";
import { formatRoles } from "@/lib/staff-roles";
import type { StaffMember } from "@/types/anime";

/**
 * 制作人员名单。**不折叠、全列**。
 *
 * 为什么不像年表那样超过 12 条就截断：实测「音乐」这个职位最靠后落在**第 27 位**
 * （《鲁路修》），截断的默认值只要小于 26 就会把音乐藏掉；给到 30 以上又和全列没区别。
 * 少一个交互，少一处会出错的地方。
 *
 * ⚠️ 名字**不是链接**。人物页本轮不做，做成链接点了会跳 404——
 * 宁可点了没反应，也不能给一个坏链接。
 */
export function StaffList({ staff }: { staff: StaffMember[] }) {
  if (staff.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        暂无制作人员资料——AniList 上这部作品还没有登记 staff。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ol className="divide-y divide-border rounded-lg border border-border">
        {staff.map((member) => {
          // 职位：AniList 的原文可能带集数后缀（`Director (eps 1-479)`），
          // 由 formatRoles() 去掉括号再查中文表；没命中的原样显示英文，不硬翻。
          // 职位为空时返回 null（不是空串），下面据此整行不渲染
          const roles = formatRoles(member.roles);

          return (
            <li key={member.id} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
              {/*
                名字取 native（日文写法），没有才退到罗马音。
                `break-words` 不能省：职位串最长能到五六个词，窄屏不换行会撑破容器。
              */}
              <span className="break-words">
                {member.nameNative ?? member.nameFull ?? UNKNOWN_TITLE}
              </span>
              {member.nameNative && member.nameFull ? (
                <span className="break-words text-xs text-muted-foreground">
                  {member.nameFull}
                </span>
              ) : null}
              {/* 职位取不到时整行不渲染——不显示空串、也不留下一个孤零零的分隔符 */}
              {roles ? <span className="break-words text-xs text-muted-foreground">{roles}</span> : null}
            </li>
          );
        })}
      </ol>

      <p className="text-xs text-muted-foreground">
        仅列出主要制作人员，非完整名单。
      </p>
      <PersonNameNote />
    </div>
  );
}
