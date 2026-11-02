const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const grades = ['A', 'B+', 'B', 'C+', 'C', 'D+', 'D'];
const weightTotalMessage = (units) => `Total weight ${units / 100}%; ${units < 10000 ? 'missing' : 'excess'} ${Math.abs(10000 - units) / 100}%. Weights must total 100%.`;

// Pure boundary validation: no Express objects, database access, or mutation.
const validateCreateSection = (input) => {
  const errors = [];
  const add = (path, message) => errors.push({ path, message });
  const keys = (value, allowed, path) => {
    Object.keys(value).forEach((key) => {
      if (!allowed.includes(key)) add(`${path}${key}`, 'This field is not supported.');
    });
  };
  const text = (value, max, path) => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
      add(path, `Enter non-empty text of at most ${max} characters`);
      return value;
    }
    return value.trim();
  };
  if (!isObject(input)) return { success: false, errors: [{ path: 'body', message: 'Send a JSON object.' }] };
  keys(input, ['courseCode', 'courseName', 'sectionNumber', 'academicYear', 'semester', 'credits', 'gradingMode', 'withdrawalDeadline', 'gradeThresholds', 'components'], '');
  const data = { ...input };
  data.courseCode = text(input.courseCode, 30, 'courseCode');
  data.courseName = text(input.courseName, 200, 'courseName');
  data.sectionNumber = text(input.sectionNumber, 20, 'sectionNumber');
  if (!Number.isInteger(input.academicYear) || input.academicYear < 1 || input.academicYear > 9999) add('academicYear', 'Enter a Gregorian year between 1 and 9999.');
  if (![1, 2, 3].includes(input.semester)) add('semester', 'Choose semester 1, 2 or 3.');
  if (!Number.isSafeInteger(input.credits) || input.credits <= 0 || input.credits > 2147483647) add('credits', 'Enter a positive integer no larger than 2147483647.');
  if (!['criterion', 'norm'].includes(input.gradingMode)) add('gradingMode', 'Choose criterion-referenced or norm-referenced grading.');
  const date = input.withdrawalDeadline;
  const timestamp = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : NaN;
  if (!Number.isFinite(timestamp) || date.startsWith('0000') || new Date(timestamp).toISOString().slice(0, 10) !== date) add('withdrawalDeadline', 'Enter a real date in YYYY-MM-DD format.');
  if (input.gradingMode === 'norm' && input.gradeThresholds !== null) add('gradeThresholds', 'Norm-referenced courses must not have fixed cutoffs.');
  if (input.gradingMode === 'criterion') {
    if (!isObject(input.gradeThresholds)) add('gradeThresholds', 'Provide grade cutoffs.');
    else {
      keys(input.gradeThresholds, grades, 'gradeThresholds.');
      grades.forEach((grade, index) => {
        const value = input.gradeThresholds[grade];
        if (!Number.isFinite(value) || value < 0 || value > 100) add(`gradeThresholds.${grade}`, 'Enter a number between 0 and 100.');
        else if (index && value >= input.gradeThresholds[grades[index - 1]]) add(`gradeThresholds.${grade}`, 'Cutoffs must decrease from A through D.');
      });
      data.gradeThresholds = { ...input.gradeThresholds };
    }
  }
  if (!Array.isArray(input.components) || input.components.length < 1 || input.components.length > 30) add('components', 'Provide between 1 and 30 assessments.');
  else {
    let total = 0;
    let validWeights = true;
    data.components = input.components.map((component, index) => {
      const path = `components.${index}`;
      if (!isObject(component)) { add(path, 'Each assessment must be an object.'); validWeights = false; return component; }
      keys(component, ['name', 'weightPercent', 'maximumScore', 'inputType'], `${path}.`);
      const name = text(component.name, 100, `${path}.name`);
      if (!['marks', 'attendance'].includes(component.inputType)) add(`${path}.inputType`, 'Choose marks or attendance as the input type.');
      const weight = component.weightPercent;
      const units = Math.round(weight * 100);
      // Tolerance handles binary representation, not a shortfall in the total.
      if (!Number.isFinite(weight) || weight <= 0 || weight > 100 || Math.abs(weight * 100 - units) > 1e-8) {
        add(`${path}.weightPercent`, 'Enter a weight greater than 0 and at most 100, with at most two decimal places.');
        validWeights = false;
      } else total += units;
      if (!Number.isFinite(component.maximumScore) || component.maximumScore <= 0) add(`${path}.maximumScore`, 'Enter a finite positive number.');
      return { name, weightPercent: weight, maximumScore: component.maximumScore, inputType: component.inputType };
    });
    if (validWeights && total !== 10000) add('components', weightTotalMessage(total));
  }
  return errors.length ? { success: false, errors } : { success: true, data };
};

module.exports = { validateCreateSection, weightTotalMessage };
