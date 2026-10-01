import type { RequestHandler } from './$types';
import { fetchGroups } from '$lib/server/twizzit-api';
import { loadTeamData, loadTrainingData, type TeamData, type TrainingData } from '$lib/server/team-data';
import { buildTeamSheet, buildTrainingSheet, buildTrainingDataSheet } from '$lib/server/xlsx-builder';
import { getHalfSeasonRange } from '$lib/server/season';
import XLSX from 'xlsx-js-style';

function sanitizeSheetName(name: string): string {
	return name.replace(/[/\\?*[\]:]/g, '').slice(0, 31);
}

function send(controller: ReadableStreamDefaultController, data: object) {
	const encoder = new TextEncoder();
	controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

export const GET: RequestHandler = async ({ url }) => {
	const kind = url.searchParams.get('kind') === 'training' ? 'training' : 'match';

	const stream = new ReadableStream({
		async start(controller) {
			try {
				const groups = await fetchGroups();
				const range = getHalfSeasonRange();
				send(controller, { type: 'start', total: groups.length });

				const results: Array<TeamData | TrainingData> = new Array(groups.length);
				let done = 0;

				await Promise.allSettled(
					groups.map(async (group, i) => {
						try {
							results[i] = kind === 'training'
								? await loadTrainingData(group.id, range)
								: await loadTeamData(group.id, range);
						} catch {
							results[i] = { columns: [], rows: [] };
						}
						done++;
						send(controller, { type: 'progress', done, total: groups.length, current: group.name });
					})
				);

				// Build workbook
				const wb = XLSX.utils.book_new();

				if (kind === 'training') {
					// One flat sheet with every team first, for analysis in other tools
					const teams = groups.map((group, i) => ({
						teamId: group.id,
						teamName: group.name,
						...(results[i] as TrainingData)
					}));
					XLSX.utils.book_append_sheet(wb, buildTrainingDataSheet(teams), 'Data');
				}

				for (let i = 0; i < groups.length; i++) {
					const { rows } = results[i];
					if (rows.length === 0) continue;
					const ws = kind === 'training'
						? buildTrainingSheet((results[i] as TrainingData).columns, rows)
						: buildTeamSheet((results[i] as TeamData).columns, rows);
					XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(groups[i].name));
				}

				const base64: string = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
				send(controller, { type: 'done', file: base64 });
			} catch (e) {
				send(controller, { type: 'error', message: String(e) });
			}
			controller.close();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive'
		}
	});
};
