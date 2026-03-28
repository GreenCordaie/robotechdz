/**
 * Utility for joining class names.
 * Standard implementation often uses clsx and tailwind-merge,
 * this is a lightweight version to avoid extra dependencies.
 */
export function cn(...inputs: (string | boolean | undefined | null | { [key: string]: boolean })[]) {
    const classes = [];

    for (const input of inputs) {
        if (!input) continue;

        if (typeof input === 'string') {
            classes.push(input);
        } else if (typeof input === 'object') {
            for (const key in input) {
                if (input[key]) {
                    classes.push(key);
                }
            }
        }
    }

    return classes.join(' ');
}
