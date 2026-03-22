import icalGenerator from 'ical-generator';
const cal = icalGenerator({ name: 'my first iCal' });
console.log(cal.toString());
