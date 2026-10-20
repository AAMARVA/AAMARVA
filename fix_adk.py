import re
file_path = '/app/applet/server/routes/aamarvaRoutes.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Define the correct handler
correct_handler = """router.get('/adk', securityLayer('public_reads'), (req: Request, res: Response) => {
  try {
    const platformSpec = fs.readFileSync(path.join(__dirname, '../ADK_SPEC.md/platform-spec.md'), 'utf-8');
    const endpointSpec = fs.readFileSync(path.join(__dirname, '../ADK_SPEC.md/endpoint-spec.md'), 'utf-8');
    res.json({
      success: true,
      data: {
        adk: `${platformSpec}\n\n---# API Endpoints\n\n${endpointSpec}`
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});"""

# Completely rewrite the route section for /adk
# It starts with '// 18. GET /api/adk (Get ADK specification)router.get'
# and ends with '});'

pattern = re.compile(r"// 18\. GET /api/adk.*?\}\);", re.DOTALL)
new_content = pattern.sub("// 18. GET /api/adk (Get ADK specification)\n" + correct_handler, content)

with open(file_path, 'w') as f:
    f.write(new_content)
