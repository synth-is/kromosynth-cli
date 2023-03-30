FROM node

# libasound suggestion: https://github.com/Spotifyd/spotifyd/issues/659#issuecomment-929510058
RUN apt-get update && apt-get install -y g++ make python libxi-dev libgl1-mesa-dev libasound2

WORKDIR /app

COPY package.json .
RUN npm install --quiet

RUN npm install pm2 -g

COPY . .

# https://github.com/cypress-io/cypress-docker-images/issues/52#issuecomment-446144630
COPY asound.conf /etc/asound.conf

# custom built binary for arm
RUN cp node-web-audio-api.linux-arm64-gnu.node /app/node_modules/kromosynth/node_modules/node-web-audio-api/
RUN cp node-web-audio-api.linux-arm64-gnu.node /app/node_modules/node-web-audio-api/

# https://github.com/tensorflow/tfjs/tree/master/tfjs-node#rebuild-the-package-on-raspberry-pi ... https://github.com/tensorflow/tfjs/issues/6676
RUN npm rebuild @tensorflow/tfjs-node --build-from-source
RUN npm rebuild @tensorflow/tfjs-node-gpu --build-from-source

RUN mkdir tfjs-model_yamnet_tfjs_1
RUN curl https://storage.googleapis.com/tfhub-tfjs-modules/google/tfjs-model/yamnet/tfjs/1.tar.gz | tar -xz -C ./tfjs-model_yamnet_tfjs_1

#EXPOSE 50051-50058
#EXPOSE 50061-50068

CMD ["pm2-runtime", "container_ecosystem.config.cjs"]