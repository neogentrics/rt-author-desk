'use strict';
// What a person did on an edition. "Other" takes its meaning from the note beside it.
const ROLES = [['editor', 'Editor'], ['proofreader', 'Proofreader'], ['cover-artist', 'Cover artist'], ['illustrator', 'Illustrator'],
  ['narrator', 'Narrator'], ['translator', 'Translator'], ['formatter', 'Formatter'], ['other', 'Other']];

const roleLabel = (role) => ROLES.find(([key]) => key === role)?.[1] ?? String(role);

module.exports = { ROLES, roleLabel };
