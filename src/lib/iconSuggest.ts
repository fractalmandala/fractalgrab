const RULES: [RegExp, string][] = [
	[/design|mood|inspiration|creative|dribbble|behance|ui|ux/i, 'palette'],
	[/typ|font|typeface|letter/i, 'type'],
	[/code|dev|program|frontend|backend|software|engineering|repo/i, 'code'],
	[/read|article|book|paper|newsletter|blog/i, 'book-open'],
	[/recipe|food|baking|cook|kitchen|dinner/i, 'chef-hat'],
	[/wallpaper|photo|image|picture|screenshot|art|visual/i, 'image'],
	[/music|audio|song|podcast|sound/i, 'music'],
	[/video|film|movie|cinema|youtube|clip/i, 'video'],
	[/travel|place|city|map|trip/i, 'map'],
	[/restaurant|eat|lunch|breakfast/i, 'utensils'],
	[/work|job|career|business|office/i, 'briefcase'],
	[/study|learn|course|school|uni|tutorial/i, 'graduation-cap'],
	[/ai|ml|model|llm|prompt/i, 'sparkles'],
	[/favourite|favorite|love|heart/i, 'heart'],
	[/camera|shoot|photography/i, 'camera'],
	[/idea|note|thought|draft/i, 'pen-tool'],
	[/gift|wish|want|shopping|buy/i, 'gift'],
	[/nature|garden|plant|forest|ocean|mountain/i, 'leaf'],
	[/fractal|mandala|pattern|geometry/i, 'command']
];

export function suggestIcon(name: string): string {
	for (const [re, icon] of RULES) {
		if (re.test(name)) return icon;
	}
	return 'folder';
}
