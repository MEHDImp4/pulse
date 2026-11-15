import { autoplay } from "./autoplay";
import { clear } from "./clear";
import { filter } from "./filter";
import { forceskip } from "./forceskip";
import { djrole } from "./djrole";
import { fairqueue } from "./fairqueue";
import { favorite } from "./favorite";
import { myplaylist } from "./myplaylist";
import { help } from "./help";
import { leave } from "./leave";
import { loop } from "./loop";
import { lyrics } from "./lyrics";
import { nowplaying } from "./nowplaying";
import { pause } from "./pause";
import { party } from "./party";
import { play } from "./play";
import { playlist } from "./playlist";
import { playnext } from "./playnext";
import { previous } from "./previous";
import { queue } from "./queue";
import { quality } from "./quality";
import { remove } from "./remove";
import { resume } from "./resume";
import { seek } from "./seek";
import { search } from "./search";
import { shuffle } from "./shuffle";
import { skip } from "./skip";
import { status } from "./status";
import { stop } from "./stop";
import { testaudio } from "./testaudio";
import { volume } from "./volume";
import { voteskip } from "./voteskip";
import type { CommandDefinition } from "./types";

export type { CommandContext, CommandDefinition } from "./types";

export const commands: CommandDefinition[] = [
  play,
  search,
  playnext,
  playlist,
  testaudio,
  pause,
  party,
  resume,
  skip,
  forceskip,
  djrole,
  fairqueue,
  favorite,
  myplaylist,
  previous,
  seek,
  stop,
  queue,
  quality,
  nowplaying,
  lyrics,
  loop,
  autoplay,
  filter,
  shuffle,
  remove,
  clear,
  voteskip,
  volume,
  status,
  leave,
  help,
];

export const commandMap = new Map(commands.map((command) => [command.data.name, command]));
