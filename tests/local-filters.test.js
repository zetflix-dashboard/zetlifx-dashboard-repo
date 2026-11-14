import test from 'node:test';
import assert from 'node:assert/strict';
import { datasets } from '../src/shared/data/datasets.js';
import { validateChart } from '../src/shared/charts/contract.js';
import { availableLocalFilters, validateLocalFilters, datasetQueryParams } from '../src/shared/filters/LocalFilters.js';
import { validateLayout } from '../src/layout/LayoutStorage.js';

const c14 = {
  id:'C14', title:'Стоимость часа', question:'Стоимость по тайтлам?',
  dataset:'titleCostPerHour', template:'scatter', dimension:'hours',
  series:[{field:'cost_per_hour'}], localFilters:['genre'],
};
const c15 = {
  id:'C15', title:'Просмотры оригиналов', question:'Доля оригиналов?',
  dataset:'originalsViewing', template:'pie', dimension:'origin',
  series:[{field:'hours'}], localFilters:['access'],
};
const defs = { C14:validateChart(c14), C15:validateChart(c15) };
const known = id => defs[id];
test('local filters use approved options, default to all and preserve parameter order',()=>{
  assert.equal(availableLocalFilters(c14).length,1);
  assert.deepEqual(validateLocalFilters(c14,{genre:'all'}),{});
  assert.deepEqual(validateLocalFilters(c14,{genre:'Драма'}),{genre:'Драма'});
  assert.deepEqual(datasetQueryParams(c14,{periodFrom:'2024-01',periodTo:'2025-12'},{genre:'Драма'}),
    ['2024-01-01','2025-12-01','Драма']);
  assert.deepEqual(datasetQueryParams(c15,{periodFrom:'2024-01',periodTo:'2025-12'},{}),
    ['2024-01-01','2025-12-01','all']);
  assert.equal(datasets.titleCostPerHour.sql.split('?').length - 1,3);
  assert.equal(datasets.originalsViewing.sql.split('?').length - 1,3);
});
test('unknown keys, injected values and unauthorized chart filters fail closed',()=>{
  assert.throws(()=>validateLocalFilters(c14,{genre:"Драма' OR TRUE --"}));
  assert.throws(()=>validateLocalFilters(c14,{access:'Подписка'}));
  assert.throws(()=>validateChart({...c14,localFilters:['access']}));
  assert.throws(()=>validateChart({...c14,localFilters:['genre','genre']}));
});
test('header blocks and per-widget filters round-trip without changing old chart layout',()=>{
  const raw = {version:1,dashboardId:'test',widgets:[
    {instanceId:'chart-a',chartId:'C14',x:0,y:0,w:6,h:5,localFilters:{genre:'Драма'}},
    {instanceId:'heading-a',type:'heading',title:' Заголовок ',x:0,y:5,w:12,h:1},
    {instanceId:'chart-b',chartId:'C15',x:6,y:0,w:6,h:5},
  ]};
  const layout=validateLayout(raw,known);
  assert.equal(layout.widgets[1].title,'Заголовок');
  assert.equal(layout.widgets[0].localFilters.genre,'Драма');
  assert.equal(layout.widgets[2].localFilters,undefined);
  assert.deepEqual(validateLayout(layout,known),layout);
  const old={version:1,dashboardId:'test',widgets:[{instanceId:'old',chartId:'C14',x:0,y:0,w:6,h:5}]};
  assert.equal(validateLayout(old,known).widgets[0].type,undefined);
});
test('invalid heading shape or tampered local filters are rejected',()=>{
  const base={version:1,dashboardId:'test',widgets:[]};
  for(const widget of [
    {type:'heading',instanceId:'a',title:'  ',x:0,y:0,w:12,h:1},
    {type:'heading',instanceId:'a',title:'Hi',chartId:'C14',x:0,y:0,w:12,h:1},
    {type:'chart',instanceId:'a',chartId:'C14',localFilters:{genre:'untrusted'},x:0,y:0,w:6,h:4},
    {type:'unknown',instanceId:'a',chartId:'C14',x:0,y:0,w:6,h:4},
  ])assert.throws(()=>validateLayout({...base,widgets:[widget]},known));
});
