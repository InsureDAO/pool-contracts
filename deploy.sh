echo 'running build.sh'

npx hardhat clean

if [ -z "$NETWORK" ]; then
  echo "ERROR: NETWORK environment variable required"
  exit 1
fi

npx mustache scripts/deploy/config/$NETWORK.json scripts/deploy/templates/deploy.template.mst > scripts/deploy/deploy.js

echo 'generated deploy.js'

npx hardhat run scripts/deploy/deploy.js --network $NETWORK