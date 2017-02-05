'use strict';

var debug = require('debug')('spdx-license-matcher');

// taken from the official unicode list for hyphen-equivalents
var hyphens = [
    '\u002D', '\u007E', '\u00AD', '\u058A', '\u05BE', '\u1400',
    '\u1806', '\u2010', '\u2011', '\u2012', '\u2013', '\u2014',
    '\u2015', '\u2053', '\u207B', '\u208B', '\u2212', '\u2E17',
    '\u2E3A', '\u2E3B', '\u301C', '\u3030', '\u30A0', '\uFE31',
    '\uFE32', '\uFE58', '\uFE63', '\uFF0D'
];
var quotes = [
    '\u0027\u0027', '\u0060\u0060',
    '\u0022', '\u0027', '\u00AB', '\u00BB', '\u2018', '\u2019',
    '\u201A', '\u201B', '\u201C', '\u201D', '\u201E', '\u201F',
    '\u2039', '\u203A', '\u300C', '\u300D', '\u300E', '\u300F',
    '\u301D', '\u301E', '\u301F', '\uFE41', '\uFE42', '\uFE43',
    '\uFE44', '\uFF02', '\uFF07', '\uFF62', '\uFF63'
];
var aliases = {
    'acknowledgment': 'acknowledgement',
    'analogue': 'analog',
    'analyse': 'analyze',
    'artefact': 'artifact',
    'authorisation': 'authorization',
    'authorised': 'authorized',
    'calibre': 'caliber',
    'cancelled': 'canceled',
    'capitalisations': 'capitalizations',
    'catalogue': 'catalog',
    'categorise': 'categorize',
    'centre': 'center',
    'emphasised': 'emphasized',
    'favour': 'favor',
    'favourite': 'favorite',
    'fulfil': 'fulfill',
    'fulfilment': 'fulfillment',
    'initialise': 'initialize',
    'judgment': 'judgement',
    'labelling': 'labeling',
    'labour': 'labor',
    'licence': 'license',
    'maximise': 'maximize',
    'modelled': 'modeled',
    'modelling': 'modeling',
    'offence': 'offense',
    'optimise': 'optimize',
    'organisation': 'organization',
    'organise': 'organize',
    'practise': 'practice',
    'programme': 'program',
    'realise': 'realize',
    'recognise': 'recognize',
    'signalling': 'signaling',
    'sub-license': 'sublicense',
    'sub license': 'sublicense',
    'utilisation': 'utilization',
    'whilst': 'while',
    'wilful': 'wilfull',
    'non-commercial': 'noncommercial',
    'per cent': 'percent',
    'copyright owner': 'copyright holder'
};
var hyphenRE = new RegExp('('+hyphens.join('|')+')', 'g');
var quoteRE = new RegExp('('+quotes.join('|')+')', 'g');
// this one's really hard programmatically, so I tried to be conservative
var bulletRE = /^\s*[^\s\w]?([a-zA-Z]|[MDCLXVImdclxvi]+|[0-9]+)?[^\s\w]\s/mg;
var aliasRE = new RegExp('('+Object.keys(aliases).join('|')+')', 'g');
var copyRE = /\s*(\u00A9|\(\s*c\s*\)|copyright)\s*/gi;
var licenseRE = /licen[cs]e(:|\))?\s*$/i;
var copyrightRE = /\s*copyright (\d+(-\d+)|<<.*?>>).*?(all rights reserved\.?|$)|all rights reserved\.?/gmi;
var emptyLineRE = /^\s+$/i;

module.exports = function normalize(str) {
    return str.replace(bulletRE, function (a) {
            debug('removing bullet:', a);
            return ' ';
        })
        .replace(copyRE, ' copyright ')
        .replace(/(copyright\s+)+/g, ' copyright ')
        .replace(copyrightRE, function (a) {
            debug('removing copyright:', a);
            return '';
        })
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .replace(hyphenRE, '-')
        .replace(quoteRE, '"')
        .replace(aliasRE, function (match) { return aliases[match]; })
        .trim();
};

function isPre(str) {
    str = str.replace(copyRE, ' copyright ')
        .replace(/(copyright\s+)+/g, ' copyright ');

    // remove any license header, such as the text "The Foo License:"
    if (/licen[cs]e(:|\))?\s*$/i.test(str)) { return true; }
    // remove any copyright notices 
    if (/^\s*copyright\b/.test(str)) { return true; }
    // remove blank lines
    if (/^\s*$/.test(str)) { return true; }
    // remove separator lines
    if (/^\s*[^\s\w]+\s*$/.test(str)) { return true; }
    return false;
}
module.exports.trimStartAndEnd = function (str) {
    var parts = str.split(/\r\n|\r|\n/);
    while (parts.length && isPre(parts[0])) {
        debug('removing preface:', parts[0]);
        parts.shift();
    }
    str = parts.join('\n');
    
    // cut anything past the end of the license text
    var end = str.match(/^(.*the license terms end here.*|\s*end of terms and conditions\s*|_{10,})$/mi);
    if (end) {
        debug('removing end text:', str.slice(end.index));
        str = str.slice(0, end.index);
    }
    return str;
}

module.exports.consumeTitle = function (obj) {
  var str = obj.template;
  var arr = str.split('\n');
  var acc = [ ];
  
  let versionRE = /\b(v(er(sion)?)?)(\.\s*)?\s*(\d+(\s*\.\s*\d+)*)/ig;
  // consume license header text
  function simplify(str, isName) {
    str = str.toLowerCase().replace(versionRE, '').trim();
    if (!isName) { return str; }
    // a little more lax on more structured data
    str = str.replace(/(\d+(\s*\.\s*\d+)*)/ig, '').trim();
    return str;
  }
  acc = [ ];
  while (1) {
    if (arr.length === 0) {
      // we've consumed everything, something is certainly wrong
      throw new Error('Consumed too much!');
    }
    
    // check for just the "full" name of the license
    if (simplify(arr[0]).indexOf(simplify(obj.name, true)) > -1) {
      acc.push(arr.shift());
      continue;
    }
    
    if (arr[0].match(/^creative commons/i)) {
      // too many variants and they don't match the spreadsheet text
      acc.push(arr.shift());
      continue;
    }
    
    // another exception, the txt file contains a heading that's supposed
    // to be the filename, but it's a different extension so we can't even check for the filename itself
    if (arr[0].match(/psfrag\.dtx/i)) {
      acc.push(arr.shift());
      continue;
    }

    // .
    if (arr[0].match(/^PS Utilities Package/i)) {
      acc.push(arr.shift());
      continue;
    }
    
    // another exception, newlines in the title
    if (arr[0].match(/^storage networking industry association|public license/i)) {
      acc.push(arr.shift());
      continue;
    }
    
    // another exceptoin...
    if (arr[0].match(/^(BSD-4-Clause \(University of California-Specific\))/i)) {
      acc.push(arr.shift());
      continue;
    }
    
    // ...
    if (arr[0].match(/^(PostgreSQL Database Management System|\(formerly known as Postgres, then as Postgres95\))/i)) {
      acc.push(arr.shift());
      continue;
    }

    // bzip2, or maybe version on a separate line from title
    if (arr[0].match(versionRE)) {
      acc.push(arr.shift());
      continue;
    }
    
    let str = simplify(arr[0]).replace(/(,\s*)?inc\./gi, '');
    let re = /licen[sc]e|agreement|freebsd copyright|notice/i; // "The FreeBSD Copyright"? seriously?
    
    // probably includes a sentence, we don't want to consume anymore
    if (!str.match(re) || str.match(/\.\s/) || str.split(/\s+/).length > 10) { break; }
    
    // dots more likely to be 'version' related
    if (arr[0].match(re)) {
      acc.push(arr.shift());
    }
  }
  if (/^\s*$/.test(arr[0])) { arr.shift(); }
  
  if (acc.length) {
    obj.title = acc.join('\n');
    obj.template = arr.join('\n');
  }
}
module.exports.consumeCopyright = function (obj) {
  var str = obj.template;
  var arr = str.split('\n');
  var acc = [ ];
  
  var re = /^\s*(\u00A9|\(\s*c\s*\)|copyright).*\d|all rights reserved\.\s*/i,
      exre = /\bredistribution\b/i;

  if (/^\s*$/.test(arr[0])) { arr.shift(); }
  while (1) {
    if (/^\s*$/.test(arr[0])) {
      acc.push(arr.shift());
      continue;
    }
    
    if (arr[0].match(re) && !arr[0].match(exre)) {
      acc.push(arr.shift());
      continue;
    }
    break;
  }
  if (/^\s*$/.test(arr[0])) { arr.shift(); }
  
  if (acc.length) {
    obj.copyright = acc.join('\n');
    obj.template = arr.join('\n');
  }
};