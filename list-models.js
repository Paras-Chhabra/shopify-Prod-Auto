const { GoogleGenAI } = require('@google/genai');

async function listModels() {
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const pager = await client.models.list({ config: { pageSize: 100 } });

    const imageModels = [];
    for await (const model of pager) {
        const name = model.name || '';
        const methods = model.supportedActions || model.supportedGenerationMethods || [];
        // Look for models that might support image output
        if (name.includes('flash') || name.includes('imagen') || name.includes('gemini-2') || name.includes('image')) {
            imageModels.push({
                name,
                displayName: model.displayName || '',
                methods: methods.join(', '),
                outputModalities: (model.supportedOutputMimeTypes || model.outputTokenLimit || ''),
            });
        }
    }

    imageModels.sort((a, b) => a.name.localeCompare(b.name));
    imageModels.forEach(m => {
        console.log(`${m.name} | ${m.displayName} | methods: ${m.methods}`);
    });
}
listModels();
