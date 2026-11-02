'use strict';
// Grade-point mapping supplied in the teammate's written ENG-10 handoff.
// Criterion score thresholds remain specific to each course section.
const GRADE_POINTS = Object.freeze({ A:4,'B+':3.5,B:3,'C+':2.5,C:2,'D+':1.5,D:1,F:0 });
const DISCLAIMER = 'ประมาณการจากข้อมูลและเกรดสมมติที่คุณระบุ ไม่ใช่คำแนะนำให้ถอนรายวิชา โปรดพิจารณาหน่วยกิต วิชาต่อเนื่อง การเปิดสอน ค่าใช้จ่าย และปรึกษาอาจารย์ที่ปรึกษา';
const gpax = ({ currentGpa, creditsCounted, courses }) => {
  if (!Number.isFinite(currentGpa) || currentGpa < 0 || currentGpa > 4 ||
      !Number.isSafeInteger(creditsCounted) || creditsCounted < 0 ||
      (creditsCounted === 0 && currentGpa !== 0) || !Array.isArray(courses)) throw new TypeError('Invalid GPAX input.');
  let qualityPoints = currentGpa * creditsCounted, credits = creditsCounted;
  for (const course of courses) {
    if (!Number.isSafeInteger(course.credits) || course.credits <= 0 ||
        !['grade','withdraw'].includes(course.outcome) ||
        (course.outcome === 'grade' && (typeof course.grade !== 'string' || !Object.hasOwn(GRADE_POINTS, course.grade)))) throw new TypeError('Invalid course outcome.');
    if (course.repeat) throw Object.assign(new Error('Repeat rule unverified.'), { code:'REPEAT_RULE_UNVERIFIED' });
    if (course.outcome === 'grade') {
      qualityPoints += GRADE_POINTS[course.grade] * course.credits;
      credits += course.credits;
    }
  }
  if (!Number.isSafeInteger(credits) || !Number.isFinite(qualityPoints)) throw new TypeError('GPAX input exceeds supported precision.');
  return { gpax:credits ? qualityPoints / credits : null, qualityPoints, creditsCounted:credits,
    appliedRepeatRule:null, assumptions:['ใช้ GPA สะสมที่รายงานและหน่วยกิตที่นับใน GPA ไม่ใช่เฉพาะหน่วยกิตที่สอบผ่าน',
      'เกรดในภาคเรียนนี้เป็นสมมติฐาน ไม่ใช่การทำนาย; W ไม่นับคะแนนหรือหน่วยกิตใน GPA'], disclaimer:DISCLAIMER };
};
const gpaxComparison = results => ({ stay:results[0].gpax,withdraw:results[1].gpax,
  delta:results[0].gpax === null || results[1].gpax === null ? null : results[1].gpax-results[0].gpax });
module.exports = { gpax, gpaxComparison, GRADE_POINTS, DISCLAIMER };
