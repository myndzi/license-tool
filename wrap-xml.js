'use strict';

var size = process.argv[2] || 80;

var pd = require('pretty-data').pd;

var str = '';
process.stdin.on('data', function (chunk) {
	str += chunk.toString();
});

process.stdin.on('end', function () {
	var prettyXml = pd.xml(str.replace(/[\s\r\n]+/g, ' '));

	var wrapped = prettyXml.split('\n').reduce((acc, cur) => {
	  if (!cur || cur.length <= size) { return acc.concat(cur); }
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
		if (indentLength + lastLine.length + c.length + 1 <= size) {
		  return a.slice(0, -1).concat(lastLine + ' ' + c);
		}
		return a.concat(indent+tagIndent+c);
	  }, [ ]);
	  return acc.concat(lines.join('\n'));
	}, [ ]).join('\n');
	
	process.stdout.write(wrapped);
});