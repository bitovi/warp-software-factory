import { type Routes } from '@angular/router';

export const appRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('@wsf/web/feature-shell').then((module) => module.AppShell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Overview · Workspace',
        loadComponent: () =>
          import('@wsf/web/feature-status').then((module) => module.StatusPage),
      },
      ...[
        {
          path: 'projects',
          title: 'Projects',
          description:
            'Organize projects and the work that moves them forward.',
        },
        {
          path: 'services',
          title: 'Services',
          description: 'Keep your services and their details in one place.',
        },
        {
          path: 'time',
          title: 'Time entries',
          description: 'Track the time spent on your work.',
        },
        {
          path: 'reports',
          title: 'Reports',
          description: 'Turn workspace activity into useful insights.',
        },
      ].map(({ path, title, description }) => ({
        path,
        title: `${title} · Workspace`,
        data: { heading: title, description },
        loadComponent: () =>
          import('@wsf/web/feature-shell').then(
            (module) => module.PlaceholderPage,
          ),
      })),
      {
        path: '**',
        title: 'Page not found · Workspace',
        data: {
          heading: 'Page not found',
          description:
            'This address does not match a workspace page. Choose a page in the navigation or return to the overview.',
          notFound: true,
        },
        loadComponent: () =>
          import('@wsf/web/feature-shell').then(
            (module) => module.PlaceholderPage,
          ),
      },
    ],
  },
];
