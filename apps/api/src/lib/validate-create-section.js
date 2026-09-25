const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const grades = ['A', 'B+', 'B', 'C+', 'C', 'D+', 'D'];

// Pure boundary validation: no Express objects, database access, or mutation.
const validateCreateSection = (input) => {
  const errors = [];
  const add = (path, message) => errors.push({ path, message });
  const keys = (value, allowed, path) => {
    Object.keys(value).forEach((key) => {
      if (!allowed.includes(key)) add(`${path}${key}`, 'Unsupported field.');
    });
  };
  const text = (value, max, path) => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
      add(path, `Expected a nonempty string of at most ${max} characters.`);
      return value;
    }
    return value.trim();
  };
  if (!isObject(input)) return { success: false, errors: [{ path: 'body', message: 'Expected a JSON object.' }] };
  keys(input, ['courseCode', 'courseName', 'sectionNumber', 'academicYear', 'semester', 'credits', 'gradingMode', 'withdrawalDeadline', 'gradeThresholds', 'components'], '');
  const data = { ...input };
  data.courseCode = text(input.courseCode, 30, 'courseCode');
  data.courseName = text(input.courseName, 200, 'courseName');
  data.sectionNumber = text(input.sectionNumber, 20, 'sectionNumber');
  if (!Number.isInteger(input.academicYear) || input.academicYear < 1 || input.academicYear > 9999) add('academicYear', 'Expected a Gregorian year from 1 to 9999.');
  if (![1, 2, 3].includes(input.semester)) add('semester', 'Expected 1, 2, or 3.');
  if (!Number.isSafeInteger(input.credits) || input.credits <= 0 || input.credits > 2147483647) add('credits', 'Expected a positive 32-bit integer.');
  if (!['criterion', 'norm'].includes(input.gradingMode)) add('gradingMode', 'Expected criterion or norm.');
  const date = input.withdrawalDeadline;
  const timestamp = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : NaN;
  if (!Number.isFinite(timestamp) || date.startsWith('0000') || new Date(timestamp).toISOString().slice(0, 10) !== date) add('withdrawalDeadline', 'Expected a valid calendar date in YYYY-MM-DD format.');
  if (input.gradingMode === 'norm' && input.gradeThresholds !== null) add('gradeThresholds', 'Must be null for norm grading.');
  if (input.gradingMode === 'criterion') {
    if (!isObject(input.gradeThresholds)) add('gradeThresholds', 'Expected grade thresholds.');
    else {
      keys(input.gradeThresholds, grades, 'gradeThresholds.');
      grades.forEach((grade, index) => {
        const value = input.gradeThresholds[grade];
        if (!Number.isFinite(value) || value < 0 || value > 100) add(`gradeThresholds.${grade}`, 'Expected a number from 0 to 100.');
        else if (index && value >= input.gradeThresholds[grades[index - 1]]) add(`gradeThresholds.${grade}`, 'Thresholds must strictly decrease from A to D.');
      });
      data.gradeThresholds = { ...input.gradeThresholds };
    }
  }
  if (!Array.isArray(input.components) || input.components.length < 1 || input.components.length > 30) add('components', 'Expected 1 to 30 components.');
  else {
    let total = 0;
    let validWeights = true;
    data.components = input.components.map((component, index) => {
      const path = `components.${index}`;
      if (!isObject(component)) { add(path, 'Expected an object.'); validWeights = false; return component; }
      keys(component, ['name', 'weightPercent', 'maximumScore'], `${path}.`);
      const name = text(component.name, 100, `${path}.name`);
      const weight = component.weightPercent;
      const units = Math.round(weight * 100);
      // Tolerance handles binary representation, not a shortfall in the total.
      if (!Number.isFinite(weight) || weight <= 0 || weight > 100 || Math.abs(weight * 100 - units) > 1e-8) {
        add(`${path}.weightPercent`, 'Expected a positive percentage up to 100 with at most two decimal places.');
        validWeights = false;
      } else total += units;
      if (!Number.isFinite(component.maximumScore) || component.maximumScore <= 0) add(`${path}.maximumScore`, 'Expected a finite positive number.');
      return { name, weightPercent: weight, maximumScore: component.maximumScore };
    });
    if (validWeights && total !== 10000) add('components', `Weights must total 100 percent; received ${total / 100}.`);
  }
  return errors.length ? { success: false, errors } : { success: true, data };
};

module.exports = { validateCreateSection };
