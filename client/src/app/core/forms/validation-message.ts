import { AbstractControl } from '@angular/forms';

/**
 * Turns a control's first failing validator into a readable message, but only
 * once the field has been touched so a pristine form is not covered in red.
 */
export function validationMessage(
  control: AbstractControl,
  label: string,
): string | null {
  if (!control.touched || !control.errors) return null;

  const errors = control.errors;

  if (errors['required']) return `${label} is required.`;

  if (errors['minlength']) {
    return `${label} must be at least ${errors['minlength'].requiredLength} characters.`;
  }

  if (errors['maxlength']) {
    return `${label} must be at most ${errors['maxlength'].requiredLength} characters.`;
  }

  if (errors['pattern']) {
    return `${label} may contain only letters, digits and @ . _ -`;
  }

  return `${label} is invalid.`;
}
