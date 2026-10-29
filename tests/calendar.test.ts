import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCalendar, periodNumber, dateKey, schoolYearRange } from '../lib/calendar';
import { parseFood } from '../lib/food';
const ics = (...events: string[]) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//IoBot//Tests//EN\r\n${events.map(e=>`BEGIN:VEVENT\r\n${e}\r\nEND:VEVENT`).join('\r\n')}\r\nEND:VCALENDAR`;
test('only exact Period 1–8 titles count as numbered periods',()=>{
 for(let i=1;i<=8;i++) assert.equal(periodNumber(`Period ${i}`),i);
 for(const title of ['Period 10','Period 9','pd. 7','Srs. College – Period 7','Period 1 assembly']) assert.equal(periodNumber(title),null);
});
test('UTC times group into Honolulu calendar dates',()=>{
 const [day]=parseCalendar(ics('UID:a\r\nDTSTART:20261027T001500Z\r\nDTEND:20261027T010000Z\r\nSUMMARY:Period 1'),'2026-10-26','2026-10-26');
 assert.equal(day.key,'2026-10-26');assert.equal(day.periods[0].start,'2026-10-27T00:15:00.000Z');
 assert.equal(dateKey(new Date('2026-10-27T09:59:59Z')),'2026-10-26');
});
test('school year boundary uses Hawaii rather than system timezone',()=>{
 assert.deepEqual(schoolYearRange(new Date('2026-07-01T05:00:00Z')),{from:'2025-07-01',to:'2026-06-30'});
});
test('recurrence exceptions replace the original time and canceled events disappear',()=>{
 const days=parseCalendar(ics('UID:r\r\nDTSTART:20261026T180000Z\r\nDTEND:20261026T190000Z\r\nRRULE:FREQ=DAILY;COUNT=2\r\nSUMMARY:Period 2','UID:r\r\nRECURRENCE-ID:20261027T180000Z\r\nDTSTART:20261027T183000Z\r\nDTEND:20261027T193000Z\r\nSUMMARY:Period 2','UID:c\r\nDTSTART:20261026T190000Z\r\nDTEND:20261026T200000Z\r\nSUMMARY:Period 3\r\nSTATUS:CANCELLED'),'2026-10-26','2026-10-27');
 assert.equal(days.length,2);assert.equal(days[0].periods.length,1);assert.equal(days[1].periods[0].start,'2026-10-27T18:30:00.000Z');
});
test('schedule labels and extra blocks retain official times',()=>{
 const [day]=parseCalendar(ics('UID:s\r\nDTSTART;VALUE=DATE:20261026\r\nDTEND;VALUE=DATE:20261027\r\nSUMMARY:C Schedule','UID:l\r\nDTSTART:20261026T221500Z\r\nDTEND:20261026T230000Z\r\nSUMMARY:Lunch'),'2026-10-26','2026-10-26');
 assert.equal(day.label,'C Schedule');assert.equal(day.extras[0].title,'Lunch');assert.equal(day.periods.length,0);
});
test('bulletin parser preserves date and menu and flags an old bulletin',()=>{
 const text='DAILY BULLETIN: Monday, October 26, 2026\nUS SCHEDULE: C           Periods: 5,6,7,8,1,2\nWeinberg Snack Bar: Spicy Ahi Bowl\nOne Team Wagon: Tonkatsu Sandwich\nASC Dining Hall: Misoyaki Pork,\nBuffalo Chicken Sandwich\n--------------------\nTODAY’S SCHEDULE';
 const menu=parseFood(text,'2026-10-27');assert.equal(menu.current,false);assert.equal(menu.items.length,3);assert.deepEqual(menu.periodOrder,[5,6,7,8,1,2]);assert.equal(menu.items[2].meal,'Misoyaki Pork, Buffalo Chicken Sandwich');assert.throws(()=>parseFood('Site maintenance','2026-10-26'));
});

test('multi-day holidays include every date and exclude DTEND',()=>{
 const days=parseCalendar(ics('UID:h\r\nDTSTART;VALUE=DATE:20261221\r\nDTEND;VALUE=DATE:20261224\r\nSUMMARY:Winter Break'),'2026-12-21','2026-12-24');
 assert.deepEqual(days.map(d=>d.key),['2026-12-21','2026-12-22','2026-12-23']);
});
