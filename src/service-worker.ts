/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const worker = self as unknown as ServiceWorkerGlobalScope;
const cacheName = `master-shifter-${version}`;
const appFiles = [...build, ...files];

worker.addEventListener('install', (event) => {
	event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(appFiles)));
});

worker.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((key) => key !== cacheName).map((key) => caches.delete(key))))
			.then(() => worker.clients.claim())
	);
});

worker.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	const requestUrl = new URL(event.request.url);
	if (requestUrl.origin !== worker.location.origin) return;

	event.respondWith(
		fetch(event.request)
			.then((response) => {
				if (response.ok) {
					const copy = response.clone();
					void caches.open(cacheName).then((cache) => cache.put(event.request, copy));
				}
				return response;
			})
			.catch(async () => (await caches.match(event.request)) ?? Response.error())
	);
});
