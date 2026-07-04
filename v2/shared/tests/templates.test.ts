import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TEMPLATES, TEMPLATE_MAP, TEMPLATE_CATEGORIES } from '../src/templates/registry'

test('registry ships at least 30 templates', () => {
  assert.ok(TEMPLATES.length >= 30, `expected >= 30, got ${TEMPLATES.length}`)
})

test('template ids are unique', () => {
  const ids = TEMPLATES.map((t) => t.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('every slot maps to a grid area and slot ids are unique per template', () => {
  for (const tpl of TEMPLATES) {
    const areas = new Set(tpl.grid.areas.flatMap((row) => row.split(/\s+/)))
    const slotIds = new Set<string>()
    for (const slot of tpl.slots) {
      assert.ok(areas.has(slot.area), `${tpl.id}: slot '${slot.id}' area '${slot.area}' not in grid areas`)
      assert.ok(!slotIds.has(slot.id), `${tpl.id}: duplicate slot id '${slot.id}'`)
      slotIds.add(slot.id)
    }
  }
})

test('grid rows/areas dimensions agree', () => {
  for (const tpl of TEMPLATES) {
    const rowCount = tpl.grid.rows.trim().split(/\s+/).length
    assert.equal(tpl.grid.areas.length, rowCount, `${tpl.id}: ${tpl.grid.areas.length} area rows vs ${rowCount} row sizes`)
    const colCount = tpl.grid.columns.trim().split(/\s+/).length
    for (const row of tpl.grid.areas) {
      assert.equal(row.split(/\s+/).length, colCount, `${tpl.id}: area row '${row}' vs ${colCount} columns`)
    }
  }
})

test('every template category is presentable', () => {
  const known = new Set(TEMPLATE_CATEGORIES.map((c) => c.id))
  for (const tpl of TEMPLATES) assert.ok(known.has(tpl.category), `${tpl.id}: unknown category ${tpl.category}`)
})

test('map matches list', () => {
  assert.equal(Object.keys(TEMPLATE_MAP).length, TEMPLATES.length)
})
