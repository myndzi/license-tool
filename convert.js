'use strict';

// use: node convert exceptions for exceptions
var type = process.argv[2] || 'licenses',
    typeSingular = type.replace(/s$/, '');

var fs = require('fs');
var PATH = require('path');
var util = require('util');
var Promise = require('bluebird');
var blessed = require('blessed');
var groupLines = require('./group-lines');

var entityMap = {
  '>': '&gt;',
  '<': '&lt;',
  "'": '&apos;',
  '"': '&quot;',
  '&': '&amp;'
};
function escapeXmlData(str) {
  return str.replace(/[<>&]/g, match => entityMap[match]);
}
function escapeXmlAttribute(str) {
  return str.replace(/[<>&'"]/g, match => entityMap[match]);
}

var spdxMarkupRE = /<<(var|beginOptional|endOptional)/;
function hasSpdxMarkup(str) { return spdxMarkupRE.test(str); }

function convertSpdxMarkup(str) {
  var matches = str.match(/<<beginOptional;name=(.*?)>>/),
      attrs = [ ];

  if (matches) {
    attrs.push('name="'+escapeXmlAttribute(matches[1])+'"');
  }

  str = str.replace(/<<(begin|end)Optional.*?>>/g, '').trim();
  //str = escapeXmlData(str);
  str = str.replace(/<<var;(.*?)>>/g, (match, $1) => {
    var split = $1.split(';'),
        obj = split.reduce((acc, cur) => {
          var split2 = cur.split('=');
          acc[split2[0]] = split2[1];
          return acc;
        }, { });

    var str2 = '<alt';

    if (obj.name) {
      str2 += ' name="'+escapeXmlAttribute(obj.name)+'"';
    }
    if (obj.match) {
      str2 += ' match="'+escapeXmlAttribute(obj.match)+'"';
    }
    str2 += '>';
    if (obj.original) {
      str2 += escapeXmlData(obj.original);
    }
    str2 += '</alt>';
    return str2;
  });

  return str;
}

var letterBullets = /^(\s*)([^\s\w]?(?!(v|V) ?\.)(?:[a-zA-Z]|[MDCLXVImdclxvi]+)[^\s\w])(\s)/mg;
var numberBullets = /^(\s*)([^\s\w]?[0-9]+[^\s\w]|[^\s\w]?[0-9]+(?:\.[0-9]+)[^\s\w]?)(\s)/mg;
var symbolBullets = /^(\s*)([*\u2022\-])(\s)/mg;
//var bulletRE = /^(\s*)([^\s\w]?(?:[a-zA-Z]|[MDCLXVImdclxvi]+|[0-9]+(?:\.[0-9]+)*)?[^\s\w])(\s)/mg;
function convertBullets(str, color) {
  var s = color ? '{inverse}' : '<b>',
      e = color ? '{/inverse}' : '</b>';
  return str.replace(letterBullets, '$1'+s+'$2'+e+'$3')
            .replace(numberBullets, '$1'+s+'$2'+e+'$3')
            .replace(symbolBullets, '$1'+s+'$2'+e+'$3');
}

function highlightSpdxMarkup(str) {
  return str.replace(/(<<.*?>>)/g, '{inverse}$1{/inverse}');
}

var scrollPosToLine,
    resolveFn,
    title,
    lines,
    doReview;

var screen = blessed.screen({
  smartCSR: true
}),
body = blessed.box({
  top: 1,
  left: 0,
  width: '100%',
  height: '99%',
  scrollable: true,
  tags: true
}),
statusbar = blessed.box({
  top: 0,
  left: 0,
  width: '100%',
  height: 1,
  tags: true,
  style: {
    fg: 'white',
    bg: 'gray'
  }
});

screen.append(statusbar);
screen.append(body);

screen.key(['escape', 'q', 'C-c'], function(ch, key) {
  screen.destroy();
  return process.exit(0);
});

var mode = 'license';

function setMode(type) {
  switch (type) {
    case 'title':
    case '1': mode = 'title'; break;

    case 'copyright':
    case '2': mode = 'copyright'; break;

    case 'license':
    case '3': mode = 'license'; break;

    case 'optional':
    case '4': mode = 'optional'; break;
  }
  status('%sMarking: %s%s', lineStyle(mode), mode, '{/}');
}
setMode('1');

function getFormattedLine(n) {
  return formatLine(lines[n]);
}
function lineStyle(type) {
  switch (type) {
    case 'title': return '{white-fg}{blue-bg}';
    case 'copyright': return '{black-fg}{cyan-bg}';
    case 'license': return '{gray-fg}{light-gray-bg}';
    case 'optional': return '{white-fg}{light-red-bg}';
    default: return '{/}';
  }
}
function formatLine(line) {
  var style = lineStyle(line.type);

  var data = blessed.escape(line.data);
  if (line.type === 'license' || line.type === 'optional') {
    data = convertBullets(data, true);
  }
  data = highlightSpdxMarkup(data);

  return style + data + '{/}';
}

function tagLineCounts() {
  var boxWidth = body.width,
      pos = 0;

  scrollPosToLine = new Array(body.getScrollHeight()+1);

  lines.forEach((line, idx) => {
    var lineWidth = body.strWidth(line.data),
        wrappedHeight = Math.max(1, Math.ceil(lineWidth / boxWidth));

    line.wrappedHeight = wrappedHeight;
    for (var i = 0; i < wrappedHeight; i++) {
      scrollPosToLine[pos++] = idx;
    }
  });

  while (pos < scrollPosToLine.length) {
    scrollPosToLine[pos++] = lines.length - 1;
  }
}

body.on('resize', tagLineCounts);

function loadData(_data, _resolve) {
  doReview = false;

  title = _data.name + ' ('+_data.identifier+')';

  lines = groupLines(_data.template);

  body.setContent( lines.map(v => formatLine(v)).join('\n') );

  resolveFn = _resolve;

  body.scrollTo(0);

  setMode('1');
  screen.render();

  tagLineCounts();
}

function status() {
  var str = util.format.apply(util, arguments);
  str = title ? title + ' - ' + str : 'Loading...';
  if (doReview) {
    str += '               {white-fg}{red-bg}REVIEW{/}';
  }
  statusbar.setContent(str);
  screen.render();
}

function mark(_start, _end) {
  var start = scrollPosToLine[_start], end = scrollPosToLine[_end];
  //status('mark: %s -> %s (%s -> %s)', _start, _end, start, end);
  if (start === end) { return; }

  if (start < end) {
    for (var i = start; i < end; i++) {
      lines[i].type = mode;
      body.setLine(i, getFormattedLine(i));
    }
  } else {
    for (var i = start - 1; i >= end; i--) {
      lines[i].type = null;
      body.setLine(i, getFormattedLine(i));
    }
  }

  // blessed's wrapping seems to be affected by formatting even when the width of the text in question doesn't change
  // so we need to recalculate after we change things
  tagLineCounts();
}

screen.key('`', function () {
  doReview = !doReview;
  setMode(mode);
});

screen.key(['up', 'down', 'pageup', 'pagedown'], function(ch, key) {
  var startNo = Math.min(body.getScroll(), body.getScrollHeight());

  var linePos = scrollPosToLine[startNo];
  if (!lines[linePos]) {
    screen.destroy();

    console.error(lines);
    console.error(scrollPosToLine);
    console.error(lines.length, startNo, body.getScroll(), body.getScrollHeight());

  }
  var pageSize = Math.floor(body.height * .8),
      lineSize = lines[linePos] ? lines[linePos].wrappedHeight : 1,
      scrollDist;

  switch (key.name) {
    case 'pageup': scrollDist = -pageSize; break;
    case 'pagedown': scrollDist = pageSize; break;
    case 'up': scrollDist = -lineSize; break;
    case 'down': scrollDist = lineSize; break;
    default: throw new Error('Invalid scroll key');
  }

  body.scrollTo(Math.max(0, Math.min(body.getScrollHeight(), startNo + scrollDist)));

  var endNo = body.getScroll();

  mark(startNo, endNo);

  screen.render();
});

screen.key(['1', '2', '3', '4'], function (ch, key) {
  switch (ch) {
    case '1': statusbar.setContent('Title'); break;
    case '2': statusbar.setContent('Copyright'); break;
    case '3': statusbar.setContent('License'); break;
    case '4': statusbar.setContent('Optional'); break;
  }
  setMode(ch);
  screen.render();
});

screen.key(['tab', 'return'], function () {
  resolveFn([lines, doReview]);
});

function formatSubData(lines) {
  lines = wrapLis(lines);
  return lines.map(v => {
    if (v.tagType === 'list') {
      return v.isStart ? '<list>' : '</list>';
    }
    return '<'+v.tagType+'>'+v.data+'</'+v.tagType+'>'
  }).join('\n');
}

function insertOls(lines) {
  var depth = -1;
  var newLines = lines.reduce((acc, cur) => {
    if (cur.depth < depth) {
      while (cur.depth < depth) {
        acc.push({ tagType: 'list', isStart: false });
        depth--;
      }
    } else if (cur.depth > depth) {
      while (cur.depth > depth) {
        acc.push({ tagType: 'list', type: cur.type, isStart: true, data: '' });
        depth++;
      }
    }
    acc.push(cur);
    return acc;
  }, [ ]);
  while (0 < depth) {
    newLines.push({ tagType: 'list', isStart: false });
    depth--;
  }
  return newLines;
}

function condenseOls(lines) {
  var ols = [ ], acc = [ ];
  lines.forEach(line => {
    if (line.tagType === 'list') {
      if (line.isStart) {
        ols.push(line);
        acc.push(line);
      } else if (line.isEnd) {
        var lastOl = ols.pop();
        if (ols.length) {
          ols[ols.length-1].data += '<list>'+lastOl.data+'</list>';
        }
      }
    } else if (line.tagType === 'li') {
      ols[ols.length-1].type = line.type;
      ols[ols.length-1].data += '<li>'+line.data+'</li>';
    } else {
      acc.push(line);
    }
  });
  return acc;
}

function escapeForRender(v) {
  // ugly hack
  if (/^<li|list>/.test(v.data)) { return v.data; }

  var data = v.data.trim();

  if (hasSpdxMarkup(data)) {
    data = convertSpdxMarkup(data);
  } else {
    data = escapeXmlData(data);
  }

  if (v.type === 'license' || v.type === 'optional') {
    data = convertBullets(data);
  }
  return data;
}

function condenseBrs(lines) {
  return lines.reduce((acc, cur) => {
    if (!acc.length) {
      return [{
        type: cur.type,
        tagType: cur.tagType,
        depth: cur.depth,
        data: escapeForRender(cur)
      }];
    }

    if (cur.tagType === 'list') {
      return acc.concat(cur);
    }

    if (cur.tagType !== 'br') {
      return acc.concat({
        type: cur.type,
        tagType: cur.tagType,
        depth: cur.depth,
        data: escapeForRender(cur)
      });
    }

    var last = acc.slice(-1)[0];

    if (last.tagType !== 'p') {
      return acc.concat({
        type: cur.type,
        tagType: 'p',
        depth: cur.depth,
        data: escapeForRender(cur)
      });
    }

    return acc.slice(0, -1).concat({
      type: last.type,
      tagType: last.tagType,
      depth: last.depth,
      data: last.data + '<br/>' + escapeForRender(cur)
    });
  }, [ ]);
}

function condenseLis(lines) {
  var lis = lines.filter(v => v.tagType === 'li');
  if (lis.length === 0) { return lines; }

  var firstIdx = lines.findIndex(v => v === lis[0]),
      lastIdx = lines.findIndex(v => v === lis[lis.length-1]);

  var acc = [ ], tmp, i = firstIdx;

  while (i <= lastIdx) {
    // add the 'li' bit
    tmp = [ lines[i++] ];
    // add any non-lis too
    while (i < lastIdx && (
      lines[i].tagType !== 'li'
    )) {
      tmp.push(lines[i++]);
    }

    var openP = false, depth = tmp[0].depth;
    var reduced = tmp.reduce((acc, v) => {
      var data = escapeForRender(v);

      if (v.tagType === 'br') {
        return acc + '<br/>' + data;
      }
      if (v.tagType === 'li') {
        var matches = data.match(/^(<b>[^<]+<\/b>)(.*)$/);
        if (!matches) {
          matches = [ null, '', data ];
        }
        return acc + matches[1] + '<p>' + matches[2].trim();
      }
      return acc + '</p><p>' + data;
    }, '')+'</p>';

    acc.push({
      type: tmp[0].type,
      tagType: tmp[0].tagType,
      depth: tmp[0].depth,
      data: reduced
    });
  }

  return lines.slice(0, firstIdx)
              .concat(condenseOls(insertOls(acc)))
              .concat(lines.slice(lastIdx + 1));
}

function condenseAll(lines) {
  return {
    type: lines[0].type,
    data: lines.map(v => '<'+v.tagType+'>'+v.data+'</'+v.tagType+'>').join('')
  };
}

function render(lines) {
  var sections = lines.reduce((acc, cur) => {
    var last = acc.slice(-1)[0];

    if (last.length && last.slice(-1)[0].type !== cur.type) {
      return acc.slice(0, -1).concat([last]).concat([[cur]]);
    }

    return acc.slice(0, -1).concat([last.concat(cur)]);
  }, [[ ]]);

  sections = sections.map(section => {
    return section.map(v => {
      if (v.type !== 'license' && v.type !== 'optional' && v.tagType === 'li') {
        v.tagType = 'p';
        v.depth = void 0;
      }
      return v;
    });
  });

  return sections.map(condenseLis).map(condenseBrs).map(condenseAll);
}


var pd = require('pretty-data').pd;

Promise.each(require('./build-'+type), function (data) {
  var outputPath = PATH.join(__dirname, 'src', type, data.identifier+'.xml');

  try {
    fs.statSync(outputPath);
    return;
  } catch (e) {
    // file doesn't exist, okay to write
  }

  return new Promise(function (resolve, reject) {
    loadData(data, resolve);
  }).spread((lines, review) => {
    return [
      lines.filter(lines => !lines.isDummy),
      review
    ];
  }).spread((lines, review) => {
    var sections = render(lines);

    var licenseBody = sections.map(v => {
      var tag;
      switch (v.type) {
        //case 'header': tag = 'header'; break;
        case 'title': tag = 'title'; break;
        case 'copyright': tag = 'copyright'; break;
        case 'license': tag = 'body'; break;
        case 'optional': tag = 'optional'; break;
        default:
        screen.destroy();
        console.log(v);
        throw new Error('Invalid part type: '+v.type);
      }
      return '<'+tag+'>'+v.data+'</'+tag+'>';
    }).join('');

    var str = '';

    if (review) {
      str += '<!-- REVIEW -->';
    }

    str += '<spdx name="'+escapeXmlAttribute(data.name)+'" identifier="'+escapeXmlAttribute(data.identifier)+'"';
    if (data.hasOwnProperty('osiApproved')) {
        str += ' osi-approved="'+data.osiApproved+'"';
    }
    str += '>';

    if (data.urls) {
      str += '<urls>';
      data.urls.filter(v => v).forEach(url => {
        str += '<url>'+escapeXmlData(url)+'</url>';
      });
      str += '</urls>';
    }

    if (data.notes) {
      str += '<notes>'+escapeXmlData(data.notes)+'</notes>';
    }

    if (data.header) {
      var header = data.header.trim();
      if (hasSpdxMarkup(header)) {
        header = convertSpdxMarkup(header, { type: 'header', data: header });
        header = convertBullets(header);
        if (/\r|\n|\r\n/.test(header)) {
          str += '<header>\n'+header+'\n</header>';
        } else {
          str += '<header>'+header+'</header>';
        }
      }
    }

    str += '<'+typeSingular+'>'+licenseBody+'</'+typeSingular+'>';
    str += '</spdx>';

    var prettyXml = pd.xml(str);

    var wrapped = prettyXml.split('\n').reduce((acc, cur) => {
      if (!cur || cur.length <= 80) { return acc.concat(cur); }
      if (/^<[^>]+>$/m.test(cur)) { return acc.concat(cur); }

      var matches = cur.match(/^( *)(.*)$/m);
      var tagMatches = cur.match(/^( *)(<[^>]+>)/m);
      var indent = matches[1], words = matches[2].split(' '), tagIndent = '';
      if (tagMatches) { tagIndent = tagMatches[2].replace(/./g, ' '); }
      if (/^\s*<alt/m.test(cur)) { tagIndent = ''; }

      var lines = words.reduce((a, c) => {
        if (a.length === 0) { return [ indent+c ]; }
        var indentLength = a.length > 1 ? indent.length + tagIndent.length : indent.length;
        var lastLine = a[a.length-1];
        if (indentLength + lastLine.length + c.length + 1 <= 80) {
          return a.slice(0, -1).concat(lastLine + ' ' + c);
        }
        return a.concat(indent+tagIndent+c);
      }, [ ]);
      return acc.concat(lines.join('\n'));
    }, [ ]).join('\n');

    fs.writeFileSync(outputPath, wrapped);
  });
}).then(function () {
  screen.destroy();
});