echo 'running build.sh'

npx hardhat clean

if [ -z "$NETWORK" ]; then
  echo "ERROR: NETWORK environment variable required"
  exit 1
fi

npx mustache scripts/config/$NETWORK.json scripts/deploy.template.js > scripts/deploy.js

echo 'generated deploy.js'

npx hardhat run scripts/deploy.js --network $NETWORK