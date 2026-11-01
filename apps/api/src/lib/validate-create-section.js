const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const grades = ['A', 'B+', 'B', 'C+', 'C', 'D+', 'D'];
const weightTotalMessage = (units) => `ผลรวมน้ำหนัก ${units / 100}%; ${units < 10000 ? 'ขาด' : 'เกิน'} ${Math.abs(10000 - units) / 100}%. น้ำหนักต้องรวมเป็น 100%.`;

// Pure boundary validation: no Express objects, database access, or mutation.
const validateCreateSection = (input) => {
  const errors = [];
  const add = (path, message) => errors.push({ path, message });
  const keys = (value, allowed, path) => {
    Object.keys(value).forEach((key) => {
      if (!allowed.includes(key)) add(`${path}${key}`, 'ระบบไม่รองรับช่องข้อมูลนี้');
    });
  };
  const text = (value, max, path) => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
      add(path, `กรุณากรอกข้อความไม่ว่างและไม่เกิน ${max} ตัวอักษร`);
      return value;
    }
    return value.trim();
  };
  if (!isObject(input)) return { success: false, errors: [{ path: 'body', message: 'กรุณาส่งข้อมูลเป็นออบเจ็กต์ JSON' }] };
  keys(input, ['courseCode', 'courseName', 'sectionNumber', 'academicYear', 'semester', 'credits', 'gradingMode', 'withdrawalDeadline', 'gradeThresholds', 'components'], '');
  const data = { ...input };
  data.courseCode = text(input.courseCode, 30, 'courseCode');
  data.courseName = text(input.courseName, 200, 'courseName');
  data.sectionNumber = text(input.sectionNumber, 20, 'sectionNumber');
  if (!Number.isInteger(input.academicYear) || input.academicYear < 1 || input.academicYear > 9999) add('academicYear', 'กรุณากรอกปี ค.ศ. ตั้งแต่ 1 ถึง 9999');
  if (![1, 2, 3].includes(input.semester)) add('semester', 'กรุณาเลือกภาคเรียน 1, 2 หรือ 3');
  if (!Number.isSafeInteger(input.credits) || input.credits <= 0 || input.credits > 2147483647) add('credits', 'กรุณากรอกจำนวนเต็มบวกไม่เกิน 2147483647');
  if (!['criterion', 'norm'].includes(input.gradingMode)) add('gradingMode', 'กรุณาเลือกรูปแบบอิงเกณฑ์หรืออิงกลุ่ม');
  const date = input.withdrawalDeadline;
  const timestamp = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : NaN;
  if (!Number.isFinite(timestamp) || date.startsWith('0000') || new Date(timestamp).toISOString().slice(0, 10) !== date) add('withdrawalDeadline', 'กรุณากรอกวันที่ที่มีอยู่จริงในรูปแบบ YYYY-MM-DD');
  if (input.gradingMode === 'norm' && input.gradeThresholds !== null) add('gradeThresholds', 'รายวิชาอิงกลุ่มต้องไม่มีเกณฑ์ตัดเกรดแบบคงที่');
  if (input.gradingMode === 'criterion') {
    if (!isObject(input.gradeThresholds)) add('gradeThresholds', 'กรุณาระบุเกณฑ์ตัดเกรด');
    else {
      keys(input.gradeThresholds, grades, 'gradeThresholds.');
      grades.forEach((grade, index) => {
        const value = input.gradeThresholds[grade];
        if (!Number.isFinite(value) || value < 0 || value > 100) add(`gradeThresholds.${grade}`, 'กรุณากรอกตัวเลขตั้งแต่ 0 ถึง 100');
        else if (index && value >= input.gradeThresholds[grades[index - 1]]) add(`gradeThresholds.${grade}`, 'เกณฑ์ต้องลดลงตามลำดับจาก A ถึง D');
      });
      data.gradeThresholds = { ...input.gradeThresholds };
    }
  }
  if (!Array.isArray(input.components) || input.components.length < 1 || input.components.length > 30) add('components', 'กรุณาระบุรายการประเมิน 1 ถึง 30 รายการ');
  else {
    let total = 0;
    let validWeights = true;
    data.components = input.components.map((component, index) => {
      const path = `components.${index}`;
      if (!isObject(component)) { add(path, 'กรุณาระบุข้อมูลรายการเป็นออบเจ็กต์'); validWeights = false; return component; }
      keys(component, ['name', 'weightPercent', 'maximumScore', 'inputType'], `${path}.`);
      const name = text(component.name, 100, `${path}.name`);
      if (!['marks', 'attendance'].includes(component.inputType)) add(`${path}.inputType`, 'กรุณาเลือกประเภทคะแนนหรือการเข้าเรียน');
      const weight = component.weightPercent;
      const units = Math.round(weight * 100);
      // Tolerance handles binary representation, not a shortfall in the total.
      if (!Number.isFinite(weight) || weight <= 0 || weight > 100 || Math.abs(weight * 100 - units) > 1e-8) {
        add(`${path}.weightPercent`, 'กรุณากรอกน้ำหนักมากกว่า 0 ถึง 100 โดยมีทศนิยมไม่เกินสองตำแหน่ง');
        validWeights = false;
      } else total += units;
      if (!Number.isFinite(component.maximumScore) || component.maximumScore <= 0) add(`${path}.maximumScore`, 'กรุณากรอกตัวเลขบวกที่มีค่าจำกัด');
      return { name, weightPercent: weight, maximumScore: component.maximumScore, inputType: component.inputType };
    });
    if (validWeights && total !== 10000) add('components', weightTotalMessage(total));
  }
  return errors.length ? { success: false, errors } : { success: true, data };
};

module.exports = { validateCreateSection, weightTotalMessage };
