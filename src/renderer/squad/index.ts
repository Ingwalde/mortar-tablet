// Клієнт режиму відділення: публічний інтерфейс; з'єднання, сховище, черга й журнал розкладені по сусідніх модулях. Імпорти нижче також підключають модулі з обробниками при завантаженні.
export { onSquadChange, type Link, type Session } from "./state";
export { squadInfo, reportInfo, editReport, reportExported, closeReport, openReportText, isSquadMember, mayUseSolution, squadScope, markRights, markLocked, memberName, markAuthor, isOwnMark, type MarkRights } from "./access";
export { shareLog } from "./log";
export { createSquad, joinSquad, leaveSquad, retrySquad, sendAdmin, shareLocalMarks, resumeSquad, type JoinError } from "./admin";
