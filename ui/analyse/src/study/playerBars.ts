import { h, VNode } from 'snabbdom';
import renderClocks from '../view/clocks';
import AnalyseCtrl from '../ctrl';
import { renderMaterialDiffs } from '../view/view';
import { TagArray } from './interfaces';
import { findTag, isFinished, looksLikeLichessGame, resultOf } from './studyChapters';

interface Player {
  name: string;
  team?: string;
  fed?: string;
}
interface Players {
  white: Player;
  black: Player;
}

export default function (ctrl: AnalyseCtrl): VNode[] | undefined {
  const study = ctrl.study;
  if (!study) return;
  const tags = study.data.chapter.tags,
    feds = study.data.chapter.feds || [],
    players = {
      white: { name: findTag(tags, 'white')!, team: findTag(tags, 'whiteteam'), fed: feds[0] },
      black: { name: findTag(tags, 'black')!, team: findTag(tags, 'blackteam'), fed: feds[1] },
    };

  const clocks = renderClocks(ctrl),
    ticking = !isFinished(study.data.chapter) && ctrl.turnColor(),
    materialDiffs = renderMaterialDiffs(ctrl);

  return (['white', 'black'] as Color[]).map(color =>
    renderPlayer(
      tags,
      clocks,
      materialDiffs,
      players,
      color,
      ticking === color,
      ctrl.bottomColor() !== color,
      study.data.hideRatings && looksLikeLichessGame(tags),
    ),
  );
}

function renderPlayer(
  tags: TagArray[],
  clocks: [VNode, VNode] | undefined,
  materialDiffs: [VNode, VNode],
  players: Players,
  color: Color,
  ticking: boolean,
  top: boolean,
  hideRatings?: boolean,
): VNode {
  const title = findTag(tags, `${color}title`),
    elo = hideRatings ? undefined : findTag(tags, `${color}elo`),
    result = resultOf(tags, color === 'white'),
    player = players[color];
  return h(`div.study__player.study__player-${top ? 'top' : 'bot'}`, { class: { ticking } }, [
    h('div.left', [
      result && h('span.result', result),
      h('span.info', [
        player.team && h('span.team', player.team),
        player.fed && playerFed(player.fed),
        title && h('span.utitle', title == 'BOT' ? { attrs: { 'data-bot': true } } : {}, title + ' '),
        h('span.name', player.name),
        elo && h('span.elo', elo),
      ]),
    ]),
    materialDiffs[top ? 0 : 1],
    clocks?.[color === 'white' ? 0 : 1],
  ]);
}

export const playerFed = (fed: string) =>
  h('img.flag', {
    attrs: { src: site.asset.url(`images/fide-fed/${fed}.svg`) },
  });
