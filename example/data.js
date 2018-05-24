/* eslint-disable quotes,indent */

module.exports = {
  // Note: this could be just JSON but JS has a nicer notation
  "resources": [
    {
      "type": "document",
      "name": "Manuscript",
      "lang": "mini",
      "cells": [
         "6 * 7",
         "data = 'Ice Cream Sales'!A1:C9",
         "filtered_data = filter(data, 'temp < 23')",
         `plotly([{
           x: filtered_data.temp,
           y: filtered_data.sales,
           mode: 'markers',
           name: 'sunny'
         }], {
           xaxis: { title: 'Temperature' },
           yaxis: { title: 'Ice Cream Sales' }
         })`
      ]
    }, {
      "type": "sheet",
      "name": "Ice Cream Sales",
      "lang": "mini",
      "columns": [
        { "name": "temp", "type": "number" },
        { "name": "sales", "type": "number" },
        { "name": "sunny" }
      ],
      "cells": [
        ["18", "50", "no"],
        ["20", "126", "yes"],
        ["24", "118", "yes"],
        ["23", "126", "yes"],
        ["26", "280", "yes"],
        ["25", "102", "no"],
        ["20", "93", "no"],
        ["17", "32", "no"],
        ["18", "103", "yes"],
        ["28", "246", "yes"]
      ]
    }
  ]
}
