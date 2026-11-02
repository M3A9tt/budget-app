// Revisions are comparable only within one profile.
export const acceptsProfile=(current,next)=>current.userId!==next.userId||next.revision>=current.revision;
