'use strict';

var letterBullets = /^(\s*)([^\s\w]?(?:[a-zA-Z]|[MDCLXVImdclxvi]+)[^\s\w])(\s)/m;
var numberBullets = /^(\s*)([^\s\w]?[0-9]+[^\s\w]|[^\s\w]?[0-9]+(?:\.[0-9]+)[^\s\w]?)(\s)/m;
var symbolBullets = /^(\s*)([*\u2022\-])(\s)/m;
var excludeBullets = /^\s*v\s*\./m;
function isBullet(v) {
  return (letterBullets.test(v) ||
          numberBullets.test(v) ||
          symbolBullets.test(v)) &&
         !excludeBullets.test(v);
}

function dummy() {
  return {
    isDummy: true,
    data: ' '
  };
}

function groupLines(str) {
  return str.split(/\n/).reduce((acc, cur) => {
    var last = acc.slice(-1)[0];

    if (cur.trim().length) {
      return acc.slice(0, -1).concat([
        last.concat(cur)
      ]);
    } else {
      if (!last.length) {
        return acc;
      } else {
        return acc.concat([[ ]]);
      }
    }
  }, [[ ]])
  .filter(v => v.length)
  .reduce((acc, lines) => {
    if (lines.length === 1) {
      return acc.concat({
        tagType: isBullet(lines[0]) ? 'li' : 'p',
        data: lines[0]
      }).concat(dummy());
    }

    if (!lines.some(isBullet)) {
      return acc.concat({
        tagType: 'p',
        data: lines[0]
      }).concat(lines.slice(1).map(v => (
        { tagType: 'br',
          data: v }
      ))).concat(dummy());
    }

    if (lines.every(isBullet)) {
      return acc.concat(lines.reduce((acc, v) =>
        acc.concat({
          tagType: 'li',
          data: v
        }).concat(dummy())
      , [ ]));
    }

    var tmp = [ ], bullet = null;
    lines.forEach(function (v) {
      if (bullet === isBullet(v)) {
        tmp.push(v);
        return;
      }

      if (tmp.length) {
        acc = acc.concat(tmp.reduce((a, v) =>
          a.concat({
            tagType: bullet ? 'li' : 'br',
            data: v
          }).concat(dummy())
        , [ ]));
      }

      bullet = isBullet(v);
      tmp = [ v ];
    });

    if (tmp.length) {
      acc = acc.concat(tmp.reduce((a, v) =>
        a.concat({
          tagType: bullet ? 'li' : 'br',
          data: v
        }).concat(dummy())
      , [ ]));
    }

    return acc;
  }, [ ])
  .map(v => {
    if (v.tagType !== 'li') { return v; }
    var matches = v.data.replace(/\t/g, '    ').match(/^( *)/);
    if (!matches) { v.depth = 0; }
    v.depth = Math.floor(matches[1].length / 4);
    return v;
  });
}

module.exports = groupLines;
