export const configs = {
  '*': {
    hooks: './hooks',
    options: {},
  },
};

export function load(): void {
  console.log('[CGB Studio packer] build extension loaded');
}

export function unload(): void {}
