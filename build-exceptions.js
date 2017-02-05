'use strict';

var fs = require('fs'),
    PATH = require('path');

var XLSX = require('xlsx'),
    xmlEscape = require('xml-escape');

var filename, workbook;

try {
    filename = fs.readdirSync('./license-list').find(function (v) {
        return /^spdx_licenselist_.*\.xls$/.test(v);
    });
    if (filename === void 0) {
        console.log('Could not find license list XML');
        process.exit(1);
    }
    workbook = XLSX.readFile(PATH.join(__dirname, 'license-list', filename));
} catch (e) {
    if (e.code === 'ENOENT') {
        console.log('File not found: %s', abspath);
    } else if (e.code === 'EACCES') {
        console.log('No permission to read: %s', abspath);
    } else {
        console.log(e);
    }
    process.exit(1);
}

var data = workbook.Sheets.exceptions,
    exceptions = { };

Object.keys(data).forEach(function (key) {
    var matches = key.match(/^([A-Z]+)([0-9]+)$/);
    if (!matches || !matches[2]) { return; }

    var row = matches[2],
        col = matches[1];

    exceptions[row] = exceptions[row] || { };
    exceptions[row][col] = data[key];
});

delete exceptions[1]; // header row

var exceptions = Object.keys(exceptions).map(function(key) {
    var row = exceptions[key];
    var obj = {
        name: row.A && row.A.v,
        identifier: row.B && row.B.v,
        urls: row.C && row.C.v,
        notes: row.D && row.D.v,
        //osiApproved: null, // data point doesn't exist in spreadsheet
        header: '', // not in spreadsheet/not relevant(?)
        example: row.E && row.E.v, // this is new/extra
        template: row.F && row.F.v,
        hasMarkup: false // none of them do
    };
    if (obj.urls) {
        obj.urls = obj.urls.split(/\r\n|\r|\n/);
    } else {
        obj.urls = [ ];
    }

    if (obj.name) {
        obj.name = obj.name.replace(/[\r\n]/, ' ').replace(/ +/, ' ').trim();
    }

    return obj;
}).filter(function (ex) {
    return !!ex.template;
});

module.exports = exceptions;